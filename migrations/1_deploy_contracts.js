const VotingToken = artifacts.require("VotingToken");
const Election = artifacts.require("Election");
const MockV3Aggregator = artifacts.require("MockV3Aggregator");

module.exports = async function (deployer, network, accounts) {
  const admin = accounts[0];          // First account as admin
  const initialSupply = web3.utils.toWei("100", "ether"); // 100 tokens in ERC-20 units
  const oracleDecimals = 8;
  const initialEthPrice = web3.utils.toBN("200000000000"); // 2000 * 10^8

  // Deploy VotingToken with initial supply
  await deployer.deploy(VotingToken, initialSupply, { from: admin });
  const votingToken = await VotingToken.deployed();

  console.log("VotingToken deployed at:", votingToken.address);

  await deployer.deploy(MockV3Aggregator, oracleDecimals, initialEthPrice, { from: admin });
  const priceFeed = await MockV3Aggregator.deployed();
  console.log("Mock price feed deployed at:", priceFeed.address);

  // Deploy Election contract with address of VotingToken
  await deployer.deploy(Election, votingToken.address, priceFeed.address, { from: admin });
  const election = await Election.deployed();

  console.log("Election deployed at:", election.address);

  await votingToken.setElection(election.address, { from: admin });
};
