const VotingToken = artifacts.require("VotingToken");
const Election = artifacts.require("Election");

module.exports = async function(callback) {
  try {
    // 1) Load contracts
    const token = await VotingToken.deployed();
    const election = await Election.deployed();
    const accounts = await web3.eth.getAccounts();

    // 2) Add candidates (admin = accounts[0])
    await election.addCandidate("Alice", { from: accounts[0] });
    await election.addCandidate("Bob", { from: accounts[0] });
    await election.addCandidate("Charlie", { from: accounts[0] });

    // 3) Start election
    await election.startElection({ from: accounts[0] });

    // 4) Vote (each voter is account 1..3)
    await election.vote(1, { from: accounts[1] });
    await election.vote(2, { from: accounts[2] });
    await election.vote(3, { from: accounts[3] });

    // 5) Print results
    const results = await election.getResults();
    for (let i = 0; i < results.length; i++) {
      console.log(
        results[i].id.toString(),
        results[i].name,
        results[i].voteCount.toString()
      );
    }

    callback();
  } catch (err) {
    console.error(err);
    callback(err);
  }
};
