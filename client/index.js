import Web3 from "web3";
import ElectionContract from "../build/contracts/Election.json";
import VotingTokenContract from "../build/contracts/VotingToken.json";

let web3;
let accounts = [];
let election;
let token;
let networkId;
let providerEventsBound = false;

const accountAddressEl = document.getElementById("accountAddress");
const networkNameEl = document.getElementById("networkName");
const networkIdEl = document.getElementById("networkId");
const adminAddressEl = document.getElementById("adminAddress");
const isAdminEl = document.getElementById("isAdmin");
const tokenBalanceEl = document.getElementById("tokenBalance");
const hasVotedEl = document.getElementById("hasVoted");
const electionStatusEl = document.getElementById("electionStatus");
const resultsArea = document.getElementById("resultsArea");
const statusArea = document.getElementById("statusArea");

const candidateNameInput = document.getElementById("candidateName");
const candidateIdInput = document.getElementById("candidateId");
const candidateSelect = document.getElementById("candidateSelect");
const adminCard = document.getElementById("adminCard");
const adminNotice = document.getElementById("adminNotice");
const voteCard = document.getElementById("voteCard");
const voteNotice = document.getElementById("voteNotice");
const candidateStepStatusEl = document.getElementById("candidateStepStatus");
const electionStepStatusEl = document.getElementById("electionStepStatus");
const resetStepStatusEl = document.getElementById("resetStepStatus");
const stepCandidates = document.getElementById("stepCandidates");
const stepElection = document.getElementById("stepElection");
const stepReset = document.getElementById("stepReset");

const btnConnect = document.getElementById("btnConnect");
const btnRefresh = document.getElementById("btnRefresh");
const btnAddCandidate = document.getElementById("btnAddCandidate");
const btnStartElection = document.getElementById("btnStartElection");
const btnEndElection = document.getElementById("btnEndElection");
const btnResetElection = document.getElementById("btnResetElection");
const btnVote = document.getElementById("btnVote");
const btnShowResults = document.getElementById("btnShowResults");

btnConnect.onclick = connectMetaMask;
btnRefresh.onclick = refreshState;
btnAddCandidate.onclick = addCandidate;
btnStartElection.onclick = startElection;
btnEndElection.onclick = endElection;
btnResetElection.onclick = resetElection;
btnVote.onclick = vote;
btnShowResults.onclick = showResults;

disableAllActions(true);
showUnavailableState("Connect MetaMask to continue.");

function setStatus(message, isError = false) {
  const prefix = isError ? "Error: " : "";
  const time = new Date().toLocaleTimeString();
  statusArea.textContent = `[${time}] ${prefix}${message}\n` + statusArea.textContent;
}

function disableAllActions(disabled) {
  const elements = [
    btnRefresh,
    btnAddCandidate,
    btnStartElection,
    btnEndElection,
    btnResetElection,
    btnVote,
    btnShowResults,
    candidateNameInput,
    candidateIdInput,
    candidateSelect
  ];

  elements.forEach((el) => {
    if (el) {
      el.disabled = disabled;
    }
  });
}

function updateAdminControls({ isAdmin, votingActive, candidateCount }) {
  const canAddCandidates = isAdmin && !votingActive;
  const canStartElection = isAdmin && !votingActive && candidateCount > 0;
  const canEndElection = isAdmin && votingActive;
  const canResetElection = isAdmin && (candidateCount > 0 || votingActive);

  if (candidateNameInput) {
    candidateNameInput.disabled = !canAddCandidates;
  }
  if (btnAddCandidate) {
    btnAddCandidate.disabled = !canAddCandidates;
  }
  if (btnStartElection) {
    btnStartElection.disabled = !canStartElection;
  }
  if (btnEndElection) {
    btnEndElection.disabled = !canEndElection;
  }
  if (btnResetElection) {
    btnResetElection.disabled = !canResetElection;
  }
}

function setVisible(element, isVisible) {
  if (!element) {
    return;
  }
  element.classList.toggle("is-hidden", !isVisible);
}

function setNotice(element, message) {
  if (element) {
    element.textContent = message;
  }
}

function showUnavailableState(message) {
  setVisible(adminCard, false);
  setVisible(voteCard, false);
  setVisible(adminNotice, true);
  setVisible(voteNotice, true);
  setNotice(adminNotice, message);
  setNotice(voteNotice, message);
}

function updateVisibility({ isAdmin, votingActive, hasVoted, balance }) {
  const minToken = BigInt(web3.utils.toWei("1", "ether"));
  const balanceWei = BigInt(balance.toString());
  const hasToken = balanceWei >= minToken;
  const voteEligible = votingActive && hasToken && !hasVoted;

  setVisible(adminCard, isAdmin);
  setVisible(adminNotice, !isAdmin);
  if (!isAdmin) {
    setNotice(adminNotice, "Admin controls are only available to the admin account.");
  }

  setVisible(voteCard, voteEligible);
  setVisible(voteNotice, !voteEligible);
  if (!voteEligible) {
    const reasons = [];
    if (!votingActive) {
      reasons.push("Election is not active.");
    }
    if (!hasToken) {
      reasons.push("You need 1 VOTE token to vote.");
    }
    if (hasVoted) {
      reasons.push("You have already voted.");
    }
    const message = reasons.length
      ? `Voting is not available. ${reasons.join(" ")}`
      : "Voting is not available for this account.";
    setNotice(voteNotice, message);
  }
}

function updatePipeline({ candidateCount, votingActive }) {
  const hasCandidates = candidateCount > 0;

  setVisible(btnStartElection, hasCandidates && !votingActive);
  setVisible(btnEndElection, votingActive);
  setVisible(btnResetElection, hasCandidates || votingActive);

  if (candidateStepStatusEl) {
    if (votingActive) {
      candidateStepStatusEl.textContent = `Election active (${candidateCount} candidates).`;
    } else if (hasCandidates) {
      candidateStepStatusEl.textContent = `Candidates ready (${candidateCount} total).`;
    } else {
      candidateStepStatusEl.textContent = "Add candidates to define the election.";
    }
  }

  if (electionStepStatusEl) {
    if (!hasCandidates) {
      electionStepStatusEl.textContent = "Add candidates before starting the election.";
    } else if (votingActive) {
      electionStepStatusEl.textContent = "Election is active. End it when ready.";
    } else {
      electionStepStatusEl.textContent = "Start the election when you are ready.";
    }
  }

  if (resetStepStatusEl) {
    if (!hasCandidates && !votingActive) {
      resetStepStatusEl.textContent = "No active election. Add candidates to begin a new one.";
    } else if (votingActive) {
      resetStepStatusEl.textContent =
        "Reset will end the election, clear candidates, and issue new tokens.";
    } else {
      resetStepStatusEl.textContent =
        "Clear the current election and issue new voting tokens.";
    }
  }

  if (stepCandidates) {
    stepCandidates.classList.toggle("pipeline-ready", hasCandidates);
  }
  if (stepElection) {
    stepElection.classList.toggle("pipeline-ready", hasCandidates && !votingActive);
    stepElection.classList.toggle("pipeline-active", votingActive);
  }
  if (stepReset) {
    stepReset.classList.toggle("pipeline-ready", hasCandidates || votingActive);
  }
}

function requireConnected() {
  if (!web3 || !election || !token || accounts.length === 0) {
    setStatus("Connect MetaMask and ensure contracts are deployed.", true);
    return false;
  }
  return true;
}

function bindProviderEvents() {
  if (!window.ethereum || providerEventsBound) {
    return;
  }
  providerEventsBound = true;

  window.ethereum.on("accountsChanged", async (newAccounts) => {
    accounts = newAccounts || [];
    accountAddressEl.innerText = accounts[0] || "Not connected";
    await refreshState();
  });

  window.ethereum.on("chainChanged", () => {
    window.location.reload();
  });
}

async function connectMetaMask() {
  if (!window.ethereum) {
    alert("Please install MetaMask!");
    return;
  }

  try {
    web3 = new Web3(window.ethereum);
    accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    accountAddressEl.innerText = accounts[0] || "Not connected";

    const chainIdHex = await window.ethereum.request({ method: "eth_chainId" });
    const chainId = parseInt(chainIdHex, 16);
    networkNameEl.innerText = `${chainId} (${chainIdHex})`;

    networkId = await web3.eth.net.getId();
    networkIdEl.innerText = networkId;

    const electionNetwork = ElectionContract.networks[networkId];
    const tokenNetwork = VotingTokenContract.networks[networkId];

    if (!electionNetwork || !tokenNetwork) {
      disableAllActions(true);
      setStatus(
        `Contracts not deployed for network id ${networkId}. Run truffle migrate on this network.`,
        true
      );
      showUnavailableState("Contracts are not deployed for this network.");
      return;
    }

    election = new web3.eth.Contract(ElectionContract.abi, electionNetwork.address);
    token = new web3.eth.Contract(VotingTokenContract.abi, tokenNetwork.address);

    disableAllActions(false);
    bindProviderEvents();
    await refreshState();
    setStatus("Connected successfully.");
  } catch (err) {
    setStatus(`Connection failed: ${err.message}`, true);
  }
}

async function refreshState() {
  if (!requireConnected()) {
    return;
  }

  try {
    const [admin, votingActive, hasVoted, balance, results] = await Promise.all([
      election.methods.admin().call(),
      election.methods.votingActive().call(),
      election.methods.hasVoted(accounts[0]).call(),
      token.methods.balanceOf(accounts[0]).call(),
      election.methods.getResults().call()
    ]);

    adminAddressEl.innerText = admin;
    electionStatusEl.innerText = votingActive ? "Active" : "Inactive";
    hasVotedEl.innerText = hasVoted ? "Yes" : "No";
    tokenBalanceEl.innerText = web3.utils.fromWei(balance.toString(), "ether");

    const isAdmin =
      admin && accounts[0] && admin.toLowerCase() === accounts[0].toLowerCase();
    isAdminEl.innerText = isAdmin ? "Yes" : "No";
    updateAdminControls({ isAdmin, votingActive, candidateCount: results.length });
    updateVisibility({ isAdmin, votingActive, hasVoted, balance });
    updatePipeline({ candidateCount: results.length, votingActive });

    renderCandidates(results);
  } catch (err) {
    setStatus(`Failed to refresh state: ${err.message}`, true);
  }
}

function renderCandidates(results) {
  const parsed = (results || []).map((candidate) => ({
    id: candidate.id?.toString?.() ?? candidate[0]?.toString?.() ?? "",
    name: candidate.name ?? candidate[1] ?? "",
    voteCount: candidate.voteCount?.toString?.() ?? candidate[2]?.toString?.() ?? "0"
  }));

  candidateSelect.innerHTML = "";
  if (parsed.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No candidates yet";
    candidateSelect.appendChild(option);
    candidateSelect.disabled = true;
  } else {
    parsed.forEach((candidate) => {
      const option = document.createElement("option");
      option.value = candidate.id;
      option.textContent = `#${candidate.id} - ${candidate.name}`;
      candidateSelect.appendChild(option);
    });
    candidateSelect.disabled = false;
  }

  resultsArea.textContent = parsed.length
    ? parsed
        .map(
          (candidate) =>
            `ID: ${candidate.id}, Name: ${candidate.name}, Votes: ${candidate.voteCount}`
        )
        .join("\n")
    : "No candidates yet.";
}

async function addCandidate() {
  if (!requireConnected()) {
    return;
  }

  const name = candidateNameInput.value.trim();
  if (!name) {
    setStatus("Enter a candidate name.", true);
    return;
  }

  try {
    await election.methods.addCandidate(name).send({ from: accounts[0] });
    candidateNameInput.value = "";
    setStatus(`Candidate added: ${name}`);
    await refreshState();
  } catch (err) {
    setStatus(`Add candidate failed: ${err.message}`, true);
  }
}

async function startElection() {
  if (!requireConnected()) {
    return;
  }

  try {
    await election.methods.startElection().send({ from: accounts[0] });
    setStatus("Election started.");
    await refreshState();
  } catch (err) {
    setStatus(`Start election failed: ${err.message}`, true);
  }
}

async function endElection() {
  if (!requireConnected()) {
    return;
  }

  try {
    await election.methods.endElection().send({ from: accounts[0] });
    setStatus("Election ended.");
    await refreshState();
  } catch (err) {
    setStatus(`End election failed: ${err.message}`, true);
  }
}

async function resetElection() {
  if (!requireConnected()) {
    return;
  }

  if (!election?.methods?.resetElection) {
    setStatus(
      "Reset not available in the current contract build. Recompile and redeploy, then reload.",
      true
    );
    return;
  }

  const confirmed = window.confirm(
    "Reset the election? This clears candidates, ends any active election, and issues new voting tokens."
  );
  if (!confirmed) {
    return;
  }

  try {
    await election.methods.resetElection().send({ from: accounts[0] });
    setStatus("Election reset. Create a new election by adding candidates.");
    await refreshState();
  } catch (err) {
    setStatus(`Reset failed: ${err.message}`, true);
  }
}

async function vote() {
  if (!requireConnected()) {
    return;
  }

  const inputId = candidateIdInput.value.trim();
  const selectedId = candidateSelect.value;
  const candidateId = inputId || selectedId;

  if (!candidateId) {
    setStatus("Select a candidate or enter a candidate ID.", true);
    return;
  }

  try {
    await election.methods.vote(candidateId).send({ from: accounts[0] });
    candidateIdInput.value = "";
    setStatus(`Vote cast for candidate ID: ${candidateId}.`);
    await refreshState();
  } catch (err) {
    setStatus(`Vote failed: ${err.message}`, true);
  }
}

async function showResults() {
  if (!requireConnected()) {
    return;
  }

  try {
    const results = await election.methods.getResults().call();
    renderCandidates(results);
    setStatus("Results refreshed.");
  } catch (err) {
    setStatus(`Fetching results failed: ${err.message}`, true);
  }
}
