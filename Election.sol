// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "./VotingToken.sol";

contract Election {
    struct Candidate {
        uint id;
        string name;
        uint voteCount;
    }

    address public admin;
    VotingToken public token;
    uint public candidatesCount;
    bool public votingActive;
    uint public electionId;

    mapping(uint => Candidate) public candidates;
    mapping(address => bool) public hasVoted;
    address[] private voters;

    event VoteCasted(address voter, uint candidateId);
    event ElectionReset(uint newElectionId, uint votersReissued);

    constructor(address tokenAddress) {
        admin = msg.sender;
        token = VotingToken(tokenAddress);
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

    function addCandidate(string memory name) external onlyAdmin {
        require(!votingActive, "Election already active");
        candidatesCount++;
        candidates[candidatesCount] = Candidate(candidatesCount, name, 0);
    }

    function startElection() external onlyAdmin {
        votingActive = true;
    }

    function endElection() external onlyAdmin {
        votingActive = false;
    }

    function vote(uint candidateId) external electionActive {
        require(!hasVoted[msg.sender], "Already voted");
        require(candidateId > 0 && candidateId <= candidatesCount, "Invalid candidate");
        require(token.balanceOf(msg.sender) >= 1, "No voting token");

        candidates[candidateId].voteCount += 1;
        hasVoted[msg.sender] = true;
        voters.push(msg.sender);

        emit VoteCasted(msg.sender, candidateId);
    }

    function resetElection() external onlyAdmin {
        votingActive = false;

        uint votersCount = voters.length;
        for (uint i = 0; i < votersCount; i++) {
            hasVoted[voters[i]] = false;
        }

        if (votersCount > 0) {
            token.issueVotingTokens(voters);
        }

        delete voters;
        candidatesCount = 0;
        electionId += 1;

        emit ElectionReset(electionId, votersCount);
    }

    function getResults() external view returns (Candidate[] memory) {
        Candidate[] memory results = new Candidate[](candidatesCount);
        for (uint i = 1; i <= candidatesCount; i++) {
            results[i - 1] = candidates[i];
        }
        return results;
    }
}
