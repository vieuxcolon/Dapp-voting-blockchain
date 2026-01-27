const VotingToken = artifacts.require("VotingToken");

module.exports = async function (deployer, network, accounts) {
  const admin = accounts[0]; // Ganache first account is admin
  const token = await VotingToken.deployed();

  console.log("Admin address:", admin);
  console.log("Token contract:", token.address);

  // Give 1 token to accounts 1 through 9
  for (let i = 1; i < 10; i++) {
    const voter = accounts[i];
    console.log(`Giving 1 token to account ${i}: ${voter}`);
    await token.giveVotingToken(voter, { from: admin });
  }

  console.log("Token distribution completed.");
};

