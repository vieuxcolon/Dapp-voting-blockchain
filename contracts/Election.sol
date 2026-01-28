// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "./VotingToken.sol";

interface AggregatorV3Interface {
    function decimals() external view returns (uint8);

    function latestRoundData()
        external
        view
        returns (uint80, int256, uint256, uint256, uint80);
}

contract Election {
    using ECDSA for bytes32;

    struct Candidate {
        uint id;
        string name;
        uint voteCount;
    }

    address public admin;
    VotingToken public token;
    AggregatorV3Interface public priceFeed;
    uint public candidatesCount;
    bool public votingActive;

    uint public currentElectionId;
    string public currentElectionName;

    mapping(uint => Candidate) public candidates;
    mapping(address => bool) public hasVoted;
    address[] private voters;

    event VoteCasted(address voter, uint candidateId);
    event ResultsArchived(uint indexed electionId, string name, string cid);

    struct ElectionArchive {
        uint id;
        string name;
        string cid;
        uint timestamp;
        uint candidateCount;
    }

    ElectionArchive[] private archives;

    constructor(address tokenAddress, address priceFeedAddress) {
        admin = msg.sender;
        token = VotingToken(tokenAddress);
        priceFeed = AggregatorV3Interface(priceFeedAddress);
        votingActive = false;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }

    modifier electionActive() {
        require(votingActive, "Election not active");
        _;
    }

    // ---- ORACLE FEE (5 USD) ----
    function requiredEth() public view returns (uint256) {
        (, int256 price, , , ) = priceFeed.latestRoundData();
        require(price > 0, "Invalid price");

        uint8 dec = priceFeed.decimals(); // usually 8
        // 5 USD expressed with oracle decimals
        uint256 usdAmount = 5 * (10 ** uint256(dec));

        // ETH required = (USD * 1e18) / price
        return (usdAmount * 1e18) / uint256(price);
    }

    function setElectionMeta(uint id, string calldata name) external onlyAdmin {
        require(!votingActive, "Election active");
        require(candidatesCount == 0, "Reset before new election");
        require(bytes(name).length > 0, "Name required");
        currentElectionId = id;
        currentElectionName = name;
    }

    function addCandidate(string memory name) external onlyAdmin {
        candidatesCount++;
        candidates[candidatesCount] = Candidate(candidatesCount, name, 0);
    }

    function startElection() external onlyAdmin {
        votingActive = true;
    }

    function endElection() external onlyAdmin {
        votingActive = false;
    }

    function vote(uint candidateId) external payable electionActive {
        require(!hasVoted[msg.sender], "Already voted");
        require(candidateId > 0 && candidateId <= candidatesCount, "Invalid candidate");
        require(token.balanceOf(msg.sender) >= 1, "No voting token");

        uint256 minEth = requiredEth();
        require(msg.value >= minEth, "Not enough ETH (need 5 USD)");

        candidates[candidateId].voteCount += 1;
        hasVoted[msg.sender] = true;
        voters.push(msg.sender);

        emit VoteCasted(msg.sender, candidateId);
    }

    function getResults() external view returns (Candidate[] memory) {
        Candidate[] memory results = new Candidate[](candidatesCount);
        for (uint i = 1; i <= candidatesCount; i++) {
            results[i - 1] = candidates[i];
        }
        return results;
    }

    function getLatestPrice() external view returns (int256 price, uint8 decimals) {
        (, int256 answer, , , ) = priceFeed.latestRoundData();
        return (answer, priceFeed.decimals());
    }

    function archiveResults(string calldata cid) external onlyAdmin {
        require(!votingActive, "Election active");
        require(bytes(cid).length > 0, "CID required");
        require(bytes(currentElectionName).length > 0, "Election name required");

        archives.push(
            ElectionArchive({
                id: currentElectionId,
                name: currentElectionName,
                cid: cid,
                timestamp: block.timestamp,
                candidateCount: candidatesCount
            })
        );

        emit ResultsArchived(currentElectionId, currentElectionName, cid);
    }

    function getArchives() external view returns (ElectionArchive[] memory) {
        return archives;
    }

    function resetElection() external onlyAdmin {
        votingActive = false;

        for (uint i = 1; i <= candidatesCount; i++) {
            delete candidates[i];
        }
        candidatesCount = 0;

        for (uint i = 0; i < voters.length; i++) {
            address voter = voters[i];
            if (hasVoted[voter]) {
                hasVoted[voter] = false;
                token.giveVotingTokenByElection(voter);
            }
        }
        delete voters;
        currentElectionId = 0;
        currentElectionName = "";
    }
}
