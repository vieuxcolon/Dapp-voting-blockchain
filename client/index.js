import Web3 from "web3";
import ElectionContract from "../build/contracts/Election.json";
import VotingTokenContract from "../build/contracts/VotingToken.json";

let web3;
let accounts;
let election;
let token;

const electionAddress = ElectionContract.networks["5777"].address;
const tokenAddress = VotingTokenContract.networks["5777"].address;

const accountAddressEl = document.getElementById("accountAddress");
const networkNameEl = document.getElementById("networkName");
const resultsArea = document.getElementById("resultsArea");

const btnConnect = document.getElementById("btnConnect");
const btnAddCandidate = document.getElementById("btnAddCandidate");
const btnStartElection = document.getElementById("btnStartElection");
const btnEndElection = document.getElementById("btnEndElection");
const btnVote = document.getElementById("btnVote");
const btnShowResults = document.getElementById("btnShowResults");

btnConnect.onclick = connectMetaMask;
btnAddCandidate.onclick = addCandidate;
btnStartElection.onclick = startElection;
btnEndElection.onclick = endElection;
btnVote.onclick = vote;
btnShowResults.onclick = showResults;

async function connectMetaMask() {
  if (window.ethereum) {
    try {
      web3 = new Web3(window.ethereum);
      accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      accountAddressEl.innerText = accounts[0];

      const chainId = await window.ethereum.request({ method: "eth_chainId" });
      networkNameEl.innerText = chainId;

      election = new web3.eth.Contract(ElectionContract.abi, electionAddress);
      token = new web3.eth.Contract(VotingTokenContract.abi, tokenAddress);

      alert("Connected successfully!");
    } catch (err) {
      alert("Connection failed: " + err.message);
    }
  } else {
    alert("Please install MetaMask!");
  }
}

async function addCandidate() {
  const name = document.getElementById("candidateName").value;
  await election.methods.addCandidate(name).send({ from: accounts[0] });
  alert("Candidate added: " + name);
}

async function startElection() {
  await election.methods.startElection().send({ from: accounts[0] });
  alert("Election started!");
}

async function endElection() {
  await election.methods.endElection().send({ from: accounts[0] });
  alert("Election ended!");
}

async function vote() {
  const candidateId = document.getElementById("candidateId").value;
  await election.methods.vote(candidateId).send({ from: accounts[0] });
  alert("Vote cast for candidate ID: " + candidateId);
}

async function showResults() {
  const results = await election.methods.getResults().call();
  let output = "";
  for (let i = 0; i < results.length; i++) {
    output += `ID: ${results[i].id}, Name: ${results[i].name}, Votes: ${results[i].voteCount}\n`;
  }
  resultsArea.innerText = output;
}

