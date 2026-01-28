// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "./VotingToken.sol";

contract Election {
    using ECDSA for bytes32;

    struct Candidate {
        uint id;
        string name;
        uint voteCount;
    }

    address public admin;
    VotingToken public token;
    uint public candidatesCount;
    bool public votingActive;

    mapping(uint => Candidate) public candidates;
    mapping(address => bool) public hasVoted;
    address[] private voters;

    event VoteCasted(address voter, uint candidateId);

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

    function getResults() external view returns (Candidate[] memory) {
        Candidate[] memory results = new Candidate[](candidatesCount);
        for (uint i = 1; i <= candidatesCount; i++) {
            results[i - 1] = candidates[i];
        }
        return results;
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
    }
}
