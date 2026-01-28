const VotingToken = artifacts.require("VotingToken");
const Election = artifacts.require("Election");

module.exports = async function (deployer, network, accounts) {
  const admin = accounts[0];          // First account as admin
  const initialSupply = web3.utils.toWei("100", "ether"); // 100 tokens in ERC-20 units

  // Deploy VotingToken with initial supply
  await deployer.deploy(VotingToken, initialSupply, { from: admin });
  const votingToken = await VotingToken.deployed();

  console.log("VotingToken deployed at:", votingToken.address);

  // Deploy Election contract with address of VotingToken
  await deployer.deploy(Election, votingToken.address, { from: admin });
  const election = await Election.deployed();

  console.log("Election deployed at:", election.address);

  await votingToken.setElection(election.address, { from: admin });
};
