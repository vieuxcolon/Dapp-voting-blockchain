module.exports = async function (callback) {
  try {
    const VotingToken = artifacts.require("VotingToken");
    const Election = artifacts.require("Election");

    const accounts = await web3.eth.getAccounts();
    const admin = accounts[0];

    // 1) Attach to DEPLOYED contracts (golden rule)
    const token = await VotingToken.deployed();
    const election = await Election.deployed();

    console.log("VotingToken (deployed):", token.address);
    console.log("Election (deployed):", election.address);

    // 2) Distribute tokens
    for (let i = 1; i <= 9; i++) {
      await token.giveVotingToken(accounts[i], { from: admin });
    }
    console.log("Tokens distributed.");

    // 3) Add candidates
    await election.addCandidate("Alice", { from: admin });
    await election.addCandidate("Bob", { from: admin });
    await election.addCandidate("Charlie", { from: admin });
    console.log("Candidates added.");

    // 4) Start election
    await election.startElection({ from: admin });
    console.log("Election started.");

    // 5) Vote
    await election.vote(1, { from: accounts[1] });
    await election.vote(2, { from: accounts[2] });
    await election.vote(3, { from: accounts[3] });
    console.log("Votes cast.");

    // 6) Results
    const results = await election.getResults();
    results.forEach(r => {
      console.log(
        r.id.toString(),
        r.name,
        r.voteCount.toString()
      );
    });

    callback();
  } catch (err) {
    console.error("runAll.js failed:", err);
    callback(err);
  }
};

