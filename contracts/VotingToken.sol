// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract VotingToken is ERC20 {
    address public admin;
    address public election;

    // Define a constant for 1 voting token
    uint256 public constant VOTING_TOKEN_AMOUNT = 1 * 10 ** 18;

    constructor(uint256 initialSupply) ERC20("VotingToken", "VOTE") {
        admin = msg.sender;
        _mint(admin, initialSupply); // Admin gets all tokens initially
    }

    function setElection(address electionAddress) external {
        require(msg.sender == admin, "Only admin can set election");
        require(election == address(0), "Election already set");
        election = electionAddress;
    }

    // Function to give 1 token to eligible voter
    function giveVotingToken(address voter) external {
        require(msg.sender == admin, "Only admin can give tokens");
        require(balanceOf(voter) == 0, "Voter already has a token"); // <-- fixed string
        _transfer(admin, voter, VOTING_TOKEN_AMOUNT);
    }

    function giveVotingTokenByElection(address voter) external {
        require(msg.sender == election, "Only election can give tokens");
        if (balanceOf(voter) == 0) {
            _transfer(admin, voter, VOTING_TOKEN_AMOUNT);
        }
    }
}
