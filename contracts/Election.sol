// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./VotingToken.sol";

/**
 * @dev Minimal interface of Chainlink-like price feeds (AggregatorV3Interface).
 * Used here to compute a voting fee equivalent to 5 USD in ETH.
 */
interface AggregatorV3Interface {
    function decimals() external view returns (uint8);

    function latestRoundData()
        external
        view
        returns (uint80, int256, uint256, uint256, uint80);
}

/**
 * @title Election
 * @notice Election smart contract for a token-gated voting system.
 *
 * Main ideas:
 * - Admin manages the election lifecycle (create candidates, start/end/reset).
 * - Voters can vote once per address (hasVoted mapping).
 * - Voters must hold at least 1 VOTE token (ERC-20) to be eligible.
 * - Voting requires paying a small fee, computed using an oracle (5 USD worth of ETH).
 * - Final results are archived off-chain on IPFS; the contract stores the CID on-chain.
 *
 * Important note about privacy:
 * - The contract stores only aggregated vote counts per candidate.
 * - It does NOT store a mapping "voter => candidate", so the choice is not stored on-chain.
 */
contract Election {
    // ----------------------------
    // Data structures
    // ----------------------------

    /**
     * @dev Candidate stored in contract state.
     * id is 1-based (first candidate has id=1).
     */
    struct Candidate {
        uint256 id;
        string name;
        uint256 voteCount;
    }

    /**
     * @dev Archive metadata for one election, linked to an IPFS CID.
     * The CID identifies an immutable JSON file containing results metadata (off-chain).
     */
    struct ElectionArchive {
        uint256 id;
        string name;
        string cid;
        uint256 timestamp;
        uint256 candidateCount;
    }

    // ----------------------------
    // State variables
    // ----------------------------

    /// @notice Admin address controlling the election lifecycle
    address public admin;

    /// @notice ERC-20 token representing the right to vote
    VotingToken public token;

    /// @notice Oracle used to compute required ETH for a 5 USD fee
    AggregatorV3Interface public priceFeed;

    /// @notice Number of registered candidates (1..candidatesCount)
    uint256 public candidatesCount;

    /// @notice True if voting is currently active
    bool public votingActive;

    /// @notice Metadata for current election (id + name)
    uint256 public currentElectionId;
    string public currentElectionName;

    /// @notice Candidate storage (id => Candidate)
    mapping(uint256 => Candidate) public candidates;

    /// @notice Prevents double voting: true if the address already voted in current election
    mapping(address => bool) public hasVoted;

    /**
     * @dev Internal list of voters used by resetElection() to clear hasVoted and redistribute tokens.
     * This is a simple approach suitable for a small-scale or educational project.
     * For large-scale elections, this loop could become expensive (gas).
     */
    address[] private voters;

    /// @dev On-chain list of archives (each archive references an IPFS CID)
    ElectionArchive[] private archives;

    // ----------------------------
    // Events
    // ----------------------------

    /**
     * @notice Emitted when a vote is successfully cast.
     * @dev We index voter for easier filtering in explorers/log queries.
     */
    event VoteCasted(address indexed voter, uint256 candidateId);

    /**
     * @notice Emitted when results are archived (CID anchored on-chain).
     */
    event ResultsArchived(uint256 indexed electionId, string name, string cid);

    // ----------------------------
    // Constructor / modifiers
    // ----------------------------

    /**
     * @param tokenAddress Address of deployed VotingToken contract
     * @param priceFeedAddress Address of deployed oracle (or mock in local dev)
     */
    constructor(address tokenAddress, address priceFeedAddress) {
        admin = msg.sender;
        token = VotingToken(tokenAddress);
        priceFeed = AggregatorV3Interface(priceFeedAddress);
        votingActive = false;
    }

    /// @dev Restricts a function to the admin
    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }

    /// @dev Requires the election to be active
    modifier electionActive() {
        require(votingActive, "Election not active");
        _;
    }

    // ----------------------------
    // Oracle-based voting fee (5 USD)
    // ----------------------------

    /**
     * @notice Returns the minimum ETH (in wei) required to pay a 5 USD fee.
     * @dev Uses oracle price: typically ETH/USD with 8 decimals.
     * Formula:
     *   requiredWei = (5 USD * 10^decimals * 1e18) / price
     */
    function requiredEth() public view returns (uint256) {
        (, int256 price, , , ) = priceFeed.latestRoundData();
        require(price > 0, "Invalid price");

        uint8 dec = priceFeed.decimals();
        uint256 usdAmount = 5 * (10 ** uint256(dec)); // 5 USD expressed with oracle decimals

        return (usdAmount * 1e18) / uint256(price);
    }

    /**
     * @notice (Optional) helper to expose oracle values (debug/local testing).
     * @dev Can be removed in the final version if not needed.
     */
    function getLatestPrice() external view returns (int256 price, uint8 decimals) {
        (, int256 answer, , , ) = priceFeed.latestRoundData();
        return (answer, priceFeed.decimals());
    }

    // ----------------------------
    // Election setup / lifecycle
    // ----------------------------

    /**
     * @notice Sets metadata for the next election (id + name).
     * @dev Requires no active election and no candidates registered (fresh start).
     */
    function setElectionMeta(uint256 id, string calldata name) external onlyAdmin {
        require(!votingActive, "Election active");
        require(candidatesCount == 0, "Reset before new election");
        require(bytes(name).length > 0, "Name required");

        currentElectionId = id;
        currentElectionName = name;
    }

    /**
     * @notice Adds a candidate for the current election.
     * @dev Only admin, and only when election is not active.
     */
    function addCandidate(string memory name) external onlyAdmin {
        require(!votingActive, "Election active");
        require(bytes(name).length > 0, "Candidate name required");

        candidatesCount++;
        candidates[candidatesCount] = Candidate(candidatesCount, name, 0);
    }

    /**
     * @notice Starts the election (voting becomes active).
     * @dev Requires at least one candidate and election metadata set.
     */
    function startElection() external onlyAdmin {
        require(!votingActive, "Election already active");
        require(candidatesCount > 0, "No candidates");
        require(bytes(currentElectionName).length > 0, "Election name required");

        votingActive = true;
    }

    /**
     * @notice Ends the election (voting stops).
     */
    function endElection() external onlyAdmin {
        require(votingActive, "Election not active");
        votingActive = false;
    }

    // ----------------------------
    // Voting
    // ----------------------------

    /**
     * @notice Cast a vote for a candidate.
     *
     * Requirements:
     * - election is active
     * - voter has not voted before (hasVoted)
     * - candidateId is valid
     * - voter owns at least 1 VOTE token
     * - msg.value >= requiredEth() (5 USD worth of ETH)
     *
     * @dev This contract stores ONLY aggregated vote counts. It does not store
     * the voter's choice on-chain in a (voter => candidateId) mapping.
     */
    function vote(uint256 candidateId) external payable electionActive {
        require(!hasVoted[msg.sender], "Already voted");
        require(candidateId > 0 && candidateId <= candidatesCount, "Invalid candidate");

        // Standard ERC-20 uses 18 decimals. We require ">= 1 token".
        uint256 minToken = 10 ** uint256(token.decimals());
        require(token.balanceOf(msg.sender) >= minToken, "No voting token");

        uint256 minEth = requiredEth();
        require(msg.value >= minEth, "Not enough ETH (need 5 USD)");

        candidates[candidateId].voteCount += 1;
        hasVoted[msg.sender] = true;

        // store voter to allow resetElection() to clear state and redistribute tokens
        voters.push(msg.sender);

        emit VoteCasted(msg.sender, candidateId);
    }

    /**
     * @notice Returns the full list of candidates with vote counts.
     * @dev Used by the frontend to display live results.
     */
    function getResults() external view returns (Candidate[] memory) {
        Candidate[] memory results = new Candidate[](candidatesCount);
        for (uint256 i = 1; i <= candidatesCount; i++) {
            results[i - 1] = candidates[i];
        }
        return results;
    }

    // ----------------------------
    // IPFS archiving (off-chain results anchoring)
    // ----------------------------

    /**
     * @notice Stores an IPFS CID referencing the election results archive (JSON).
     * @dev Only admin, only when election is not active.
     * The CID acts as an immutable reference: if the file changes, the CID changes.
     */
    function archiveResults(string calldata cid) external onlyAdmin {
        require(!votingActive, "Election active");
        require(bytes(cid).length > 0, "CID required");
        require(bytes(currentElectionName).length > 0, "Election name required");

        archives.push(
            ElectionArchive({
                id: currentElectionId,
                name: currentElectionName,
                cid: cid,
                timestamp: block.timestamp,
                candidateCount: candidatesCount
            })
        );

        emit ResultsArchived(currentElectionId, currentElectionName, cid);
    }

    /**
     * @notice Returns all archived elections (CID + metadata).
     * @dev Used by the frontend to display an archive list with gateway links.
     */
    function getArchives() external view returns (ElectionArchive[] memory) {
        return archives;
    }

    // ----------------------------
    // Reset election (educational / local scale)
    // ----------------------------

    /**
     * @notice Resets the election state:
     * - stops voting
     * - clears candidates
     * - clears hasVoted for recorded voters
     * - redistributes voting tokens for the next election
     * - clears election metadata
     *
     * @dev This function loops over the voters array. This is fine for small-scale
     * demos, but would not scale to very large elections on mainnet due to gas limits.
     */
    function resetElection() external onlyAdmin {
        votingActive = false;

        // Clear candidates
        for (uint256 i = 1; i <= candidatesCount; i++) {
            delete candidates[i];
        }
        candidatesCount = 0;

        // Reset voting status and re-issue tokens
        for (uint256 i = 0; i < voters.length; i++) {
            address voter = voters[i];
            if (hasVoted[voter]) {
                hasVoted[voter] = false;
                token.giveVotingTokenByElection(voter);
            }
        }

        delete voters;
        currentElectionId = 0;
        currentElectionName = "";
    }
}
