// Web3 provider and contract artifacts.
import Web3 from "web3";
import ElectionContract from "../build/contracts/Election.json";
import VotingTokenContract from "../build/contracts/VotingToken.json";

// Runtime state shared across handlers.
let web3;
let accounts = [];
let election;
let token;
let networkId;
let providerEventsBound = false;

// Common info labels.
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

// Admin / voting inputs.
const candidateNameInput = document.getElementById("candidateName");
const candidateIdInput = document.getElementById("candidateId");
const candidateSelect = document.getElementById("candidateSelect");
const electionIdInput = document.getElementById("electionIdInput"); 
const electionNameInput = document.getElementById("electionNameInput"); 
const archivesList = document.getElementById("archivesList"); 

// UI containers and pipeline step indicators.
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

// Buttons.
const btnConnect = document.getElementById("btnConnect");
const btnRefresh = document.getElementById("btnRefresh");
const btnAddCandidate = document.getElementById("btnAddCandidate");
const btnStartElection = document.getElementById("btnStartElection");
const btnEndElection = document.getElementById("btnEndElection");
const btnResetElection = document.getElementById("btnResetElection");
const btnVote = document.getElementById("btnVote");
const btnShowResults = document.getElementById("btnShowResults");
const btnSetElectionMeta = document.getElementById("btnSetElectionMeta"); // optional

// Wire up UI actions.
btnConnect.onclick = connectMetaMask;
btnRefresh.onclick = refreshState;
btnAddCandidate.onclick = addCandidate;
btnStartElection.onclick = startElection;
btnEndElection.onclick = endElection;
btnResetElection.onclick = resetElection;
btnVote.onclick = vote;
btnShowResults.onclick = showResults;
if (btnSetElectionMeta) btnSetElectionMeta.onclick = setElectionMeta;

// Default: lock the UI until MetaMask is connected.
disableAllActions(true);
showUnavailableState("Connect MetaMask to continue.");

// Append a timestamped status message to the status area.
function setStatus(message, isError = false) {
  const prefix = isError ? "Error: " : "";
  const time = new Date().toLocaleTimeString();
  if (statusArea) {
    statusArea.textContent = `[${time}] ${prefix}${message}\n` + statusArea.textContent;
  }
}

// Enable or disable all user actions at once.
function disableAllActions(disabled) {
  const elements = [
    btnRefresh,
    btnAddCandidate,
    btnStartElection,
    btnEndElection,
    btnResetElection,
    btnVote,
    btnShowResults,
    btnSetElectionMeta,
    candidateNameInput,
    candidateIdInput,
    candidateSelect,
    electionIdInput,
    electionNameInput
  ];

  elements.forEach((el) => {
    if (el) el.disabled = disabled;
  });
}

// Update admin-only controls based on current state.
function updateAdminControls({ isAdmin, votingActive, candidateCount }) {
  const canAddCandidates = isAdmin && !votingActive;
  const canStartElection = isAdmin && !votingActive && candidateCount > 0;
  const canEndElection = isAdmin && votingActive;
  const canResetElection = isAdmin && (candidateCount > 0 || votingActive);

  if (candidateNameInput) candidateNameInput.disabled = !canAddCandidates;
  if (btnAddCandidate) btnAddCandidate.disabled = !canAddCandidates;
  if (btnStartElection) btnStartElection.disabled = !canStartElection;
  if (btnEndElection) btnEndElection.disabled = !canEndElection;
  if (btnResetElection) btnResetElection.disabled = !canResetElection;
}

// Toggle an element visibility using the CSS helper class.
function setVisible(element, isVisible) {
  if (!element) return;
  element.classList.toggle("is-hidden", !isVisible);
}

// Write a short notice message.
function setNotice(element, message) {
  if (element) element.textContent = message;
}

// Disable cards and show a global message.
function showUnavailableState(message) {
  setVisible(adminCard, false);
  setVisible(voteCard, false);
  setVisible(adminNotice, true);
  setVisible(voteNotice, true);
  setNotice(adminNotice, message);
  setNotice(voteNotice, message);
}

// Show or hide admin/vote sections based on eligibility.
function updateVisibility({ isAdmin, votingActive, hasVoted, balance }) {
  // Token has 18 decimals: "1 token" == 1e18.
  const minToken = BigInt(web3.utils.toWei("1", "ether"));
  const balanceWei = BigInt(balance.toString());
  const hasToken = balanceWei >= minToken;

  // IMPORTANT: the contract also requires an ETH payment,
  // but we do not include it in the display conditions.
  const voteEligible = votingActive && hasToken && !hasVoted;

  setVisible(adminCard, isAdmin);
  setVisible(adminNotice, !isAdmin);
  if (!isAdmin) {
    setNotice(adminNotice, "Admin controls are only available to the admin account.");
  }

  setVisible(voteCard, voteEligible);
  setVisible(voteNotice, !voteEligible);

  // Explain why voting is disabled when not eligible.
  if (!voteEligible) {
    const reasons = [];
    if (!votingActive) reasons.push("Election is not active.");
    if (!hasToken) reasons.push("You need 1 VOTE token to vote.");
    if (hasVoted) reasons.push("You have already voted.");
    const message = reasons.length
      ? `Voting is not available. ${reasons.join(" ")}`
      : "Voting is not available for this account.";
    setNotice(voteNotice, message);
  } else {
    // Si voteEligible, on peut prévenir qu'il y a des frais (sans oracle UI)
    setNotice(voteNotice, "");
  }
}

// Update the stepper UI to reflect the election pipeline.
function updatePipeline({ candidateCount, votingActive }) {
  const hasCandidates = candidateCount > 0;

  setVisible(btnStartElection, hasCandidates && !votingActive);
  setVisible(btnEndElection, votingActive);
  setVisible(btnResetElection, hasCandidates || votingActive);

  if (candidateStepStatusEl) {
    if (votingActive) candidateStepStatusEl.textContent = `Election active (${candidateCount} candidates).`;
    else if (hasCandidates) candidateStepStatusEl.textContent = `Candidates ready (${candidateCount} total).`;
    else candidateStepStatusEl.textContent = "Add candidates to define the election.";
  }

  if (electionStepStatusEl) {
    if (!hasCandidates) electionStepStatusEl.textContent = "Add candidates before starting the election.";
    else if (votingActive) electionStepStatusEl.textContent = "Election is active. End it when ready.";
    else electionStepStatusEl.textContent = "Start the election when you are ready.";
  }

  if (resetStepStatusEl) {
    if (!hasCandidates && !votingActive) resetStepStatusEl.textContent = "No active election. Add candidates to begin a new one.";
    else if (votingActive) resetStepStatusEl.textContent = "Reset will end the election, clear candidates, and issue new tokens.";
    else resetStepStatusEl.textContent = "Clear the current election and issue new voting tokens.";
  }

  if (stepCandidates) stepCandidates.classList.toggle("pipeline-ready", hasCandidates);
  if (stepElection) {
    stepElection.classList.toggle("pipeline-ready", hasCandidates && !votingActive);
    stepElection.classList.toggle("pipeline-active", votingActive);
  }
  if (stepReset) stepReset.classList.toggle("pipeline-ready", hasCandidates || votingActive);
}

// Guard for any action that requires a live Web3 connection.
function requireConnected() {
  if (!web3 || !election || !token || accounts.length === 0) {
    setStatus("Connect MetaMask and ensure contracts are deployed.", true);
    return false;
  }
  return true;
}

// Listen for MetaMask account/network changes once.
function bindProviderEvents() {
  if (!window.ethereum || providerEventsBound) return;
  providerEventsBound = true;

  window.ethereum.on("accountsChanged", async (newAccounts) => {
    accounts = newAccounts || [];
    if (accountAddressEl) accountAddressEl.innerText = accounts[0] || "Not connected";
    await refreshState();
  });

  window.ethereum.on("chainChanged", () => window.location.reload());
}

// Connect to MetaMask and initialize contracts for the current network.
async function connectMetaMask() {
  if (!window.ethereum) {
    alert("Please install MetaMask!");
    return;
  }

  try {
    web3 = new Web3(window.ethereum);
    accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    if (accountAddressEl) accountAddressEl.innerText = accounts[0] || "Not connected";

    const chainIdHex = await window.ethereum.request({ method: "eth_chainId" });
    const chainId = parseInt(chainIdHex, 16);
    if (networkNameEl) networkNameEl.innerText = `${chainId} (${chainIdHex})`;

    networkId = await web3.eth.net.getId();
    if (networkIdEl) networkIdEl.innerText = networkId;

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

// Load on-chain data and update all UI sections.
async function refreshState() {
  if (!requireConnected()) return;

  try {
    const [admin, votingActive, hasVoted, balance, results, electionId, electionName] =
      await Promise.all([
        election.methods.admin().call(),
        election.methods.votingActive().call(),
        election.methods.hasVoted(accounts[0]).call(),
        token.methods.balanceOf(accounts[0]).call(),
        election.methods.getResults().call(),
        election.methods.currentElectionId().call(),
        election.methods.currentElectionName().call()
      ]);

    if (adminAddressEl) adminAddressEl.innerText = admin;
    if (electionStatusEl) {
      const title = electionName && electionName.trim().length ? `${electionName} (#${electionId})` : `Election #${electionId}`;
      electionStatusEl.innerText = `${votingActive ? "Active" : "Inactive"} - ${title}`;
    }
    if (hasVotedEl) hasVotedEl.innerText = hasVoted ? "Yes" : "No";
    if (tokenBalanceEl) tokenBalanceEl.innerText = web3.utils.fromWei(balance.toString(), "ether");

    const isAdmin = admin && accounts[0] && admin.toLowerCase() === accounts[0].toLowerCase();
    if (isAdminEl) isAdminEl.innerText = isAdmin ? "Yes" : "No";

    const candidateCount = (results || []).length;
    updateAdminControls({ isAdmin, votingActive, candidateCount });
    updateVisibility({ isAdmin, votingActive, hasVoted, balance });
    updatePipeline({ candidateCount, votingActive });

    renderCandidates(results);

    // Archives list (if your HTML has a <div id="archivesList">).
    await loadArchives();
  } catch (err) {
    setStatus(`Failed to refresh state: ${err.message}`, true);
  }
}

// Render the candidates list and the results text area.
function renderCandidates(results) {
  const parsed = (results || []).map((candidate) => ({
    id: candidate.id?.toString?.() ?? candidate[0]?.toString?.() ?? "",
    name: candidate.name ?? candidate[1] ?? "",
    voteCount: candidate.voteCount?.toString?.() ?? candidate[2]?.toString?.() ?? "0"
  }));

  if (candidateSelect) {
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
  }

  if (resultsArea) {
    resultsArea.textContent = parsed.length
      ? parsed
          .map((candidate) => `ID: ${candidate.id}, Name: ${candidate.name}, Votes: ${candidate.voteCount}`)
          .join("\n")
      : "No candidates yet.";
  }
}

// Add a new candidate (admin only).
async function addCandidate() {
  if (!requireConnected()) return;

  const name = candidateNameInput?.value?.trim?.() || "";
  if (!name) {
    setStatus("Enter a candidate name.", true);
    return;
  }

  try {
    // Contract: addCandidate(string name)
    await election.methods.addCandidate(name).send({ from: accounts[0] });
    if (candidateNameInput) candidateNameInput.value = "";
    setStatus(`Candidate added: ${name}`);
    await refreshState();
  } catch (err) {
    setStatus(`Add candidate failed: ${err.message}`, true);
  }
}

// Start the election (admin only).
async function startElection() {
  if (!requireConnected()) return;

  try {
    await election.methods.startElection().send({ from: accounts[0] });
    setStatus("Election started.");
    await refreshState();
  } catch (err) {
    setStatus(`Start election failed: ${err.message}`, true);
  }
}

// End the election and archive results (admin only).
async function endElection() {
  if (!requireConnected()) return;

  try {
    await election.methods.endElection().send({ from: accounts[0] });
    setStatus("Election ended.");

    // Archive results to IPFS after the election ends.
    await autoArchiveResults();

    await refreshState();
  } catch (err) {
    setStatus(`End election failed: ${err.message}`, true);
  }
}

// Reset election state (admin only).
async function resetElection() {
  if (!requireConnected()) return;

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
  if (!confirmed) return;

  try {
    await election.methods.resetElection().send({ from: accounts[0] });
    setStatus("Election reset. Create a new election by adding candidates.");
    await refreshState();
  } catch (err) {
    setStatus(`Reset failed: ${err.message}`, true);
  }
}

// Cast a vote (payable function).
async function vote() {
  if (!requireConnected()) return;

  const inputId = candidateIdInput?.value?.trim?.() || "";
  const selectedId = candidateSelect?.value || "";
  const candidateId = inputId || selectedId;

  if (!candidateId) {
    setStatus("Select a candidate or enter a candidate ID.", true);
    return;
  }

  try {
    // vote() is payable, so we send the required ETH value.
    const requiredWei = await election.methods.requiredEth().call();

    await election.methods.vote(candidateId).send({
      from: accounts[0],
      value: requiredWei
    });

    if (candidateIdInput) candidateIdInput.value = "";
    setStatus(`Vote cast for candidate ID: ${candidateId}. (fee paid)`);
    await refreshState();
  } catch (err) {
    setStatus(`Vote failed: ${err.message}`, true);
  }
}

// Fetch and render results.
async function showResults() {
  if (!requireConnected()) return;

  try {
    const results = await election.methods.getResults().call();
    renderCandidates(results);
    setStatus("Results refreshed.");
  } catch (err) {
    setStatus(`Fetching results failed: ${err.message}`, true);
  }
}

// Set election metadata (admin only).
async function setElectionMeta() {
  if (!requireConnected()) return;
  if (!electionIdInput || !electionNameInput) {
    setStatus("Election meta inputs not found in the UI.", true);
    return;
  }

  const id = Number(electionIdInput.value);
  const name = (electionNameInput.value || "").trim();

  if (!Number.isInteger(id) || id <= 0) {
    setStatus("Election ID must be a positive integer.", true);
    return;
  }
  if (!name) {
    setStatus("Election name required.", true);
    return;
  }

  try {
    await election.methods.setElectionMeta(id, name).send({ from: accounts[0] });
    setStatus(`Election meta set: #${id} - ${name}`);
    await refreshState();
  } catch (err) {
    setStatus(`Set election meta failed: ${err.message}`, true);
  }
}

/* =========================
   IPFS (UPLOAD + VISIBLE IN IPFS DESKTOP FILES)
   ========================= */

// Fetch all VoteCasted events to build an archive.
async function fetchAllVotesFromEvents() {
  const latestBlock = await web3.eth.getBlockNumber();
  const events = await election.getPastEvents("VoteCasted", {
    fromBlock: 0,
    toBlock: latestBlock
  });

  return events.map((e) => ({
    voter: e.returnValues.voter,
    candidateId: Number(e.returnValues.candidateId),
    txHash: e.transactionHash,
    blockNumber: e.blockNumber
  }));
}

// Remove unsafe characters for file paths.
function sanitizeFilePart(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .slice(0, 60);
}

// Hash the address to avoid storing it in clear text.
function hashVoterAddress(address) {
  try {
    const normalized = String(address || "").toLowerCase();
    return web3?.utils?.sha3 ? web3.utils.sha3(normalized) : normalized;
  } catch {
    return String(address || "");
  }
}

// Build the JSON payload for IPFS.
function buildResultsPayload(electionId, electionName, results, votes) {
  const candidates = (results || []).map((candidate) => ({
    id: Number(candidate.id ?? candidate[0] ?? 0),
    name: candidate.name ?? candidate[1] ?? "",
    votes: Number(candidate.voteCount ?? candidate[2] ?? 0)
  }));

  // Privacy: do not store raw addresses.
  const voteReceipts = (votes || []).map((v) => ({
    voterHash: hashVoterAddress(v.voter),
    candidateId: Number(v.candidateId),
    txHash: v.txHash,
    blockNumber: Number(v.blockNumber)
  }));

  return {
    electionId: Number(electionId ?? 0),
    name: electionName ?? "",
    date: new Date().toISOString(),
    candidates,
    votesCount: voteReceipts.length,
    voteReceipts
  };
}

// Mirror a CID into IPFS Desktop (MFS) for easier browsing.
async function mirrorCidToMfs(cid, meta) {
  // Make the file visible in IPFS Desktop > Files (MFS).
  try {
    const baseDir = "/voting-archives";
    const safeName = sanitizeFilePart(meta?.electionName || "election");
    const safeId = sanitizeFilePart(meta?.electionId || "0");
    const date = new Date().toISOString().slice(0, 10);
    const filePath = `${baseDir}/${safeName}-${safeId}-${date}.json`;

    await fetch(
      `http://127.0.0.1:5001/api/v0/files/mkdir?arg=${encodeURIComponent(baseDir)}&parents=true`,
      { method: "POST" }
    );

    const cpUrl =
      "http://127.0.0.1:5001/api/v0/files/cp?arg=" +
      encodeURIComponent(`/ipfs/${cid}`) +
      "&arg=" +
      encodeURIComponent(filePath);

    const cpRes = await fetch(cpUrl, { method: "POST" });
    if (!cpRes.ok) {
      setStatus("Saved to IPFS but not mirrored to IPFS Desktop Files (MFS). Check CORS on 5001.", true);
      return;
    }

    setStatus(`Also saved in IPFS Desktop Files: ${filePath}`);
  } catch {
    // ignore
  }
}

// Upload the results payload to a local IPFS node via HTTP API.
async function uploadToIpfsLocal(payload, meta = {}) {
  // Verify the IPFS API responds before uploading.
  const ver = await fetch("http://127.0.0.1:5001/api/v0/version", { method: "POST" });
  if (!ver.ok) throw new Error(`IPFS API reachable but /version failed (${ver.status})`);

  const form = new FormData();
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  form.append("file", blob, "results.json");

  let res;
  try {
    res = await fetch("http://127.0.0.1:5001/api/v0/add?pin=true&wrap-with-directory=false", {
      method: "POST",
      body: form
    });
  } catch (e) {
    throw new Error("Fetch to IPFS /add failed (network). Check console for details.");
  }

  const raw = await res.text().catch(() => "");
  // Include the response body in errors when available.
  if (!res.ok) {
    // IPFS renvoie parfois un body texte utile, on le remonte
    throw new Error(`IPFS /add failed (${res.status}). Body: ${raw.slice(0, 300)}`);
  }

  // IPFS renvoie souvent du NDJSON (une ligne JSON par objet)
  // Parse NDJSON by taking the last non-empty line.
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  let data;
  try {
    data = JSON.parse(lines[lines.length - 1]);
  } catch {
    throw new Error(`IPFS /add returned non-JSON response: ${raw.slice(0, 200)}`);
  }

  if (!data.Hash) throw new Error("IPFS response missing CID (Hash).");

  // Mirror into MFS so it appears in IPFS Desktop Files.
  await mirrorCidToMfs(data.Hash, meta);

  return data.Hash;
}


// Build and upload the results archive, then store the CID on-chain.
async function autoArchiveResults() {
  if (!requireConnected()) return;

  try {
    const [electionId, electionName, results, votes] = await Promise.all([
      election.methods.currentElectionId().call(),
      election.methods.currentElectionName().call(),
      election.methods.getResults().call(),
      fetchAllVotesFromEvents()
    ]);

    if (!electionName || electionName.trim().length === 0) {
      setStatus("Election name is empty: set it before archiving.", true);
      return;
    }

    setStatus("Archiving results to IPFS...");

    const payload = buildResultsPayload(electionId, electionName, results, votes);

    let cid;
    try {
      cid = await uploadToIpfsLocal(payload, { electionId, electionName });
    } catch (e) {
      // Retry once in case IPFS Desktop just restarted.
      setStatus(`IPFS upload failed, retrying once... (${e.message})`, true);
      cid = await uploadToIpfsLocal(payload, { electionId, electionName });
    }

    await election.methods.archiveResults(cid).send({ from: accounts[0] });

    setStatus(`Results archived on IPFS: ${cid}`);
    setStatus(`Gateway (local): http://127.0.0.1:8080/ipfs/${cid}`);

    await loadArchives();
  } catch (err) {
    setStatus(`Auto-archive failed: ${err.message}`, true);
  }
}


// Load archives from the contract and render links.
async function loadArchives() {
  if (!archivesList || !requireConnected()) return;

  try {
    const items = await election.methods.getArchives().call();
    if (!items || items.length === 0) {
      archivesList.textContent = "No archives yet.";
      return;
    }

    archivesList.innerHTML = "";
    const ul = document.createElement("ul");
    ul.className = "list-group";

    items
      .slice()
      .reverse()
      .forEach((item) => {
        const cid = item.cid || "";
        const name = item.name || "Archive";
        const ts = Number(item.timestamp || 0);
        const date = ts ? new Date(ts * 1000).toLocaleString() : "";

        const li = document.createElement("li");
        li.className = "list-group-item d-flex justify-content-between align-items-center";

        const left = document.createElement("div");
        left.innerHTML = `<strong>${name}</strong><br/><small>${date}</small><br/><small>${cid}</small>`;

        const link = document.createElement("a");
        link.href = `http://127.0.0.1:8080/ipfs/${cid}`;
        link.target = "_blank";
        link.rel = "noreferrer";
        link.textContent = "Open";
        link.className = "btn btn-sm btn-outline-primary";

        li.appendChild(left);
        li.appendChild(link);
        ul.appendChild(li);
      });

    archivesList.appendChild(ul);
  } catch (err) {
    // Non-blocking: keep UI responsive if archive loading fails.
  }
}
