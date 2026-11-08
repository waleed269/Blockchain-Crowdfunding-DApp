import { useCallback, useEffect, useMemo, useState } from "react";
import { BrowserProvider, Contract, ethers, formatEther, parseEther } from "ethers";
import deployment from "./contracts/contracts.json";

const KYC_STATES = ["None", "Pending", "Approved", "Rejected"];
const CAMPAIGN_STATES = ["Active", "Completed", "Withdrawn"];
const expectedChainId = Number(deployment.chainId);

function getMetaMaskProvider() {
  const ethereum = window.ethereum;
  if (ethereum?.isMetaMask) return ethereum;
  return ethereum?.providers?.find((provider) => provider.isMetaMask) || null;
}

function getErrorMessage(error) {
  if (error?.code === 4001 || error?.code === "ACTION_REJECTED") {
    return "Transaction was rejected in MetaMask.";
  }
  if (error?.code === -32002) {
    return "A MetaMask connection request is already open. Open the MetaMask extension, finish or dismiss that request, then try again.";
  }
  return (
    error?.reason ||
    error?.shortMessage ||
    error?.info?.error?.message ||
    error?.message ||
    "The transaction failed. Check the wallet and try again."
  );
}

function displayEth(value) {
  return Number(formatEther(value)).toFixed(4);
}

function App() {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState("");
  const [balance, setBalance] = useState("");
  const [chainId, setChainId] = useState(null);
  const [kycStatus, setKycStatus] = useState("None");
  const [campaigns, setCampaigns] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [kycForm, setKycForm] = useState({
    name: "",
    cnic: ""
  });
  const [campaignForm, setCampaignForm] = useState({
    title: "",
    description: "",
    goal: ""
  });
  const [contributionAmounts, setContributionAmounts] = useState({});
  const [transaction, setTransaction] = useState(null);
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [pageError, setPageError] = useState("");

  const registryConfig = deployment.contracts?.KYCRegistry_Waleed;
  const crowdfundingConfig = deployment.contracts?.Crowdfunding_Waleed;
  const deployed =
    Boolean(registryConfig?.address) &&
    Boolean(crowdfundingConfig?.address) &&
    Array.isArray(registryConfig?.abi) &&
    Array.isArray(crowdfundingConfig?.abi);
  const isAdmin = Boolean(account && deployment.admin) &&
    account.toLowerCase() === deployment.admin.toLowerCase();
  const onExpectedNetwork = chainId === expectedChainId;
  const verified = kycStatus === "Approved";

  const registry = useMemo(() => {
    if (!provider || !deployed) return null;
    return new Contract(registryConfig.address, registryConfig.abi, signer || provider);
  }, [deployed, provider, registryConfig, signer]);

  const crowdfunding = useMemo(() => {
    if (!provider || !deployed) return null;
    return new Contract(
      crowdfundingConfig.address,
      crowdfundingConfig.abi,
      signer || provider
    );
  }, [crowdfundingConfig, deployed, provider, signer]);

  const refreshData = useCallback(async () => {
    if (!registry || !crowdfunding || !account || !onExpectedNetwork) return;
    setLoading(true);
    setPageError("");
    try {
      const [status, allCampaigns] = await Promise.all([
        registry.getKYCStatus(account),
        crowdfunding.getAllCampaigns()
      ]);
      setKycStatus(KYC_STATES[Number(status)] || "None");
      setCampaigns(
        allCampaigns.map((campaign) => ({
          id: Number(campaign.id),
          title: campaign.title,
          description: campaign.description,
          goal: campaign.goal,
          raised: campaign.raised,
          creator: campaign.creator,
          status: Number(campaign.status)
        }))
      );
      if (isAdmin) {
        const requests = await registry.getAllRequests();
        setPendingRequests(
          requests
            .filter((request) => Number(request.status) === 1)
            .map((request) => ({
              user: request.user,
              name: request.name,
              cnic: request.cnic
            }))
        );
      } else {
        setPendingRequests([]);
      }
      const nextBalance = await provider.getBalance(account);
      setBalance(formatEther(nextBalance));
    } catch (error) {
      setPageError(`Could not load contract data: ${getErrorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  }, [account, crowdfunding, isAdmin, onExpectedNetwork, provider, registry]);

  const connectWallet = useCallback(async () => {
    setPageError("");
    const metaMask = getMetaMaskProvider();
    if (!metaMask) {
      setPageError(
        "MetaMask is not available in this browser tab. Finish unlocking or setting up the MetaMask extension, then reload this page. If it still does not connect, open this app in the same Chrome profile where MetaMask is installed."
      );
      return;
    }
    if (connecting) return;
    setConnecting(true);
    try {
      const accounts = await metaMask.request({ method: "eth_requestAccounts" });
      if (!accounts?.length) {
        throw new Error("MetaMask did not return an account. Unlock the wallet and try again.");
      }
      const nextProvider = new BrowserProvider(metaMask);
      const nextSigner = await nextProvider.getSigner(accounts[0]);
      const nextAddress = await nextSigner.getAddress();
      const [nextAccount, network, nextBalance] = await Promise.all([
        Promise.resolve(nextAddress),
        nextProvider.getNetwork(),
        nextProvider.getBalance(nextAddress)
      ]);
      setProvider(nextProvider);
      setSigner(nextSigner);
      setAccount(nextAccount);
      setBalance(formatEther(nextBalance));
      setChainId(Number(network.chainId));
      setKycForm((form) => ({
        ...form,
        name:
          nextAccount.toLowerCase() === deployment.admin?.toLowerCase()
            ? "Waleed Saeed"
            : form.name
      }));
    } catch (error) {
      setPageError(getErrorMessage(error));
    } finally {
      setConnecting(false);
    }
  }, [connecting]);

  useEffect(() => {
    const metaMask = getMetaMaskProvider();
    if (!metaMask) return undefined;
    const handleAccountsChanged = (accounts) => {
      if (accounts.length === 0) {
        setAccount("");
        setSigner(null);
        setBalance("");
        setKycStatus("None");
        setCampaigns([]);
        setPendingRequests([]);
      } else {
        void connectWallet();
      }
    };
    const handleChainChanged = () => window.location.reload();
    metaMask.on("accountsChanged", handleAccountsChanged);
    metaMask.on("chainChanged", handleChainChanged);
    return () => {
      metaMask.removeListener("accountsChanged", handleAccountsChanged);
      metaMask.removeListener("chainChanged", handleChainChanged);
    };
  }, [connectWallet]);

  useEffect(() => {
    const metaMask = getMetaMaskProvider();
    if (!metaMask || account) return;
    metaMask
      .request({ method: "eth_accounts" })
      .then((accounts) => {
        if (accounts.length > 0) return connectWallet();
        return undefined;
      })
      .catch((error) => setPageError(getErrorMessage(error)));
  }, [account, connectWallet]);

  useEffect(() => {
    if (account && provider && onExpectedNetwork) void refreshData();
  }, [account, onExpectedNetwork, provider, refreshData]);

  async function switchNetwork() {
    const metaMask = getMetaMaskProvider();
    if (!metaMask) {
      setPageError("MetaMask is not available in this browser tab. Unlock the extension and reload.");
      return;
    }
    const chainHex = `0x${expectedChainId.toString(16)}`;
    try {
      await metaMask.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: chainHex }]
      });
    } catch (error) {
      if (error?.code !== 4902) {
        setPageError(getErrorMessage(error));
        return;
      }
      try {
        await metaMask.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: chainHex,
              chainName: "Hardhat Local",
              nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
              rpcUrls: ["http://127.0.0.1:8545"]
            }
          ]
        });
      } catch (addError) {
        setPageError(getErrorMessage(addError));
      }
    }
  }

  async function transact(label, submit) {
    setTransaction({ state: "pending", message: `${label}: waiting for MetaMask...` });
    try {
      const tx = await submit();
      setTransaction({
        state: "pending",
        message: `${label}: transaction submitted. Waiting for confirmation...`,
        hash: tx.hash
      });
      await tx.wait();
      setTransaction({
        state: "confirmed",
        message: `${label}: confirmed successfully.`,
        hash: tx.hash
      });
      await refreshData();
      return true;
    } catch (error) {
      setTransaction({ state: "error", message: getErrorMessage(error) });
      return false;
    }
  }

  async function submitKYC(event) {
    event.preventDefault();
    if (!registry || !signer) return;
    const succeeded = await transact("KYC request", () =>
      registry.submitKYC(
        isAdmin ? "Waleed Saeed" : kycForm.name.trim(),
        kycForm.cnic.trim()
      )
    );
    if (succeeded) setKycForm((form) => ({ ...form, cnic: "" }));
  }

  async function submitCampaign(event) {
    event.preventDefault();
    if (!crowdfunding || !signer) return;
    try {
      const goalInWei = parseEther(campaignForm.goal);
      if (goalInWei <= 0n || goalInWei % ethers.parseUnits("1", 18) !== 0n) {
        throw new Error("Enter a whole-number goal in ETH greater than zero.");
      }
      const goalInEth = goalInWei / ethers.parseUnits("1", 18);
      const succeeded = await transact("Campaign creation", () =>
        crowdfunding.createCampaign(
          campaignForm.title.trim(),
          campaignForm.description.trim(),
          goalInEth
        )
      );
      if (succeeded) setCampaignForm({ title: "", description: "", goal: "" });
    } catch (error) {
      setTransaction({ state: "error", message: getErrorMessage(error) });
    }
  }

  async function contribute(campaignId) {
    const amount = contributionAmounts[campaignId];
    if (!amount || !crowdfunding) return;
    try {
      const value = parseEther(amount);
      if (value <= 0n) throw new Error("Enter a contribution greater than zero.");
      const succeeded = await transact(`Contribution to campaign ${campaignId}`, () =>
        crowdfunding.contribute(campaignId, { value })
      );
      if (succeeded) {
        setContributionAmounts((amounts) => ({ ...amounts, [campaignId]: "" }));
      }
    } catch (error) {
      setTransaction({ state: "error", message: getErrorMessage(error) });
    }
  }

  async function withdraw(campaignId) {
    if (!crowdfunding) return;
    await transact(`Withdrawal from campaign ${campaignId}`, () =>
      crowdfunding.withdraw(campaignId)
    );
  }

  async function decideKYC(user, decision) {
    if (!registry) return;
    await transact(`KYC ${decision}`, () =>
      decision === "approve" ? registry.approveKYC(user) : registry.rejectKYC(user)
    );
  }

  const canCreateCampaign = isAdmin || verified;

  return (
    <main className="page-shell">
      <header className="site-header">
        <a className="brand" href="#" aria-label="Crowdfund home">
          <span className="brand-mark">C</span>
          <span>Crowdfund</span>
        </a>
        <div className="wallet-area">
          {account ? (
            <div className="wallet-details">
              <span className="wallet-address">{account}</span>
              <span className="wallet-balance">{balance} ETH</span>
              <button className="button button-outline" onClick={connectWallet}>
                Refresh wallet
              </button>
            </div>
          ) : (
            <button
              className="button button-primary"
              onClick={connectWallet}
              disabled={connecting}
            >
              {connecting ? "Waiting for MetaMask..." : "Connect MetaMask"}
            </button>
          )}
        </div>
      </header>

      <section className="hero">
        <div className="eyebrow">LOCAL BLOCKCHAIN FUNDRAISING</div>
        <h1>Good ideas grow when we fund them together.</h1>
        <p>
          Launch a campaign after KYC approval, or support a project directly with ETH.
          Contributions are open to every wallet.
        </p>
        <div className="hero-meta">
          <span className="network-pill">Hardhat network · chain {expectedChainId}</span>
          <strong>Developed by Waleed, 23i-5553</strong>
        </div>
      </section>

      {!deployed && (
        <div className="notice notice-warning">
          Contracts are not deployed yet. Start the Hardhat node, then run{" "}
          <code>npm run deploy</code> from <code>hardhat-project</code>.
        </div>
      )}
      {account && !onExpectedNetwork && (
        <div className="notice notice-warning network-warning">
          <span>
            MetaMask is connected to chain {chainId}; this app requires local Hardhat chain{" "}
            {expectedChainId}.
          </span>
          <button className="button button-primary" onClick={switchNetwork}>
            Switch / add Hardhat network
          </button>
        </div>
      )}
      {!account && (
        <div className="notice notice-info">
          Connect MetaMask to view campaign data and interact with the local contracts.
        </div>
      )}
      {pageError && (
        <div className="notice notice-error" role="alert">
          <span>{pageError}</span>
          {!getMetaMaskProvider() && (
            <a
              href="https://metamask.io/download/"
              target="_blank"
              rel="noreferrer"
            >
              Get MetaMask
            </a>
          )}
        </div>
      )}
      {transaction && (
        <div className={`transaction-message ${transaction.state}`}>
          <span>{transaction.message}</span>
          {transaction.hash && (
            <span className="transaction-hash">Transaction: {transaction.hash}</span>
          )}
        </div>
      )}

      <div className="workspace-grid">
        <div className="main-column">
          <section className="panel" id="campaigns">
            <div className="section-heading">
              <div>
                <div className="eyebrow">PROJECTS</div>
                <h2>Campaigns</h2>
              </div>
              {loading && <span className="muted">Refreshing...</span>}
            </div>
            {campaigns.length === 0 ? (
              <div className="empty-state">
                {account
                  ? "No campaigns yet. Create one after connecting a verified wallet."
                  : "Connect MetaMask to load campaigns."}
              </div>
            ) : (
              <div className="campaign-grid">
                {campaigns.map((campaign) => {
                  const percentage =
                    campaign.goal > 0n
                      ? Math.min(
                          100,
                          Math.round(Number((campaign.raised * 10000n) / campaign.goal) / 100)
                        )
                      : 0;
                  const isCreator =
                    account.toLowerCase() === campaign.creator.toLowerCase();
                  return (
                    <article className="campaign-card" key={campaign.id}>
                      <div className="card-heading">
                        <span className={`status-badge status-${campaign.status}`}>
                          {CAMPAIGN_STATES[campaign.status]}
                        </span>
                        <span className="campaign-number">
                          Campaign #{campaign.id}
                        </span>
                      </div>
                      <h3>{campaign.title}</h3>
                      <p className="campaign-description">{campaign.description}</p>
                      <div className="funding-labels">
                        <strong>{displayEth(campaign.raised)} ETH</strong>
                        <span>of {displayEth(campaign.goal)} ETH</span>
                      </div>
                      <div
                        className="progress-track"
                        role="progressbar"
                        aria-label={`${percentage}% funded`}
                        aria-valuenow={percentage}
                        aria-valuemin="0"
                        aria-valuemax="100"
                      >
                        <span style={{ width: `${percentage}%` }} />
                      </div>
                      <div className="campaign-creator">
                        <span>Created by</span>
                        <code>{campaign.creator}</code>
                      </div>
                      {account && onExpectedNetwork && campaign.status === 0 && (
                        <div className="contribute-row">
                          <label className="visually-hidden" htmlFor={`amount-${campaign.id}`}>
                            Contribution amount in ETH
                          </label>
                          <input
                            id={`amount-${campaign.id}`}
                            type="number"
                            min="0.000000000000000001"
                            step="any"
                            placeholder="Amount in ETH"
                            value={contributionAmounts[campaign.id] || ""}
                            onChange={(event) =>
                              setContributionAmounts((amounts) => ({
                                ...amounts,
                                [campaign.id]: event.target.value
                              }))
                            }
                          />
                          <button
                            className="button button-primary"
                            onClick={() => contribute(campaign.id)}
                            disabled={!contributionAmounts[campaign.id] || loading}
                          >
                            Contribute
                          </button>
                        </div>
                      )}
                      {account &&
                        onExpectedNetwork &&
                        isCreator &&
                        campaign.status === 1 && (
                          <button
                            className="button button-primary full-width"
                            onClick={() => withdraw(campaign.id)}
                          >
                            Withdraw funds
                          </button>
                        )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <aside className="side-column">
          <section className="panel" id="kyc">
            <div className="eyebrow">IDENTITY</div>
            <h2>KYC verification</h2>
            <div className="status-line">
              <span>Your status</span>
              <span className={`status-badge kyc-${kycStatus.toLowerCase()}`}>
                {account ? kycStatus : "Connect wallet"}
              </span>
            </div>
            {account && onExpectedNetwork && kycStatus !== "Approved" ? (
              <form className="form-stack" onSubmit={submitKYC}>
                <label>
                  Full name
                  <input
                    value={kycForm.name}
                    onChange={(event) =>
                      setKycForm((form) => ({ ...form, name: event.target.value }))
                    }
                    placeholder="Waleed Saeed"
                    required
                    disabled={kycStatus === "Pending"}
                    readOnly={isAdmin}
                  />
                </label>
                <label>
                  CNIC
                  <input
                    value={kycForm.cnic}
                    onChange={(event) =>
                      setKycForm((form) => ({ ...form, cnic: event.target.value }))
                    }
                    placeholder="XXXXX-XXXXXXX-X"
                    required
                    disabled={kycStatus === "Pending"}
                  />
                </label>
                <p className="privacy-note">
                  CNIC is stored publicly on this local blockchain. Use test data for the
                  assignment; never submit a real CNIC to a public chain.
                </p>
                <button
                  className="button button-primary full-width"
                  type="submit"
                  disabled={kycStatus === "Pending"}
                >
                  {kycStatus === "Pending" ? "Request pending approval" : "Submit KYC request"}
                </button>
              </form>
            ) : (
              <p className="muted">
                {kycStatus === "Approved"
                  ? "Your wallet is verified and can create campaigns."
                  : "Connect to the local Hardhat network to submit KYC details."}
              </p>
            )}
          </section>

          <section className="panel" id="create-campaign">
            <div className="eyebrow">START A FUNDRAISER</div>
            <h2>Create campaign</h2>
            {!canCreateCampaign && (
              <div className="inline-notice">
                KYC approval is required before this wallet can create campaigns.
              </div>
            )}
            <form className="form-stack" onSubmit={submitCampaign}>
              <label>
                Campaign title
                <input
                  value={campaignForm.title}
                  onChange={(event) =>
                    setCampaignForm((form) => ({ ...form, title: event.target.value }))
                  }
                  placeholder="A short, clear title"
                  required
                  disabled={!canCreateCampaign || !onExpectedNetwork}
                />
              </label>
              <label>
                Description
                <textarea
                  rows="4"
                  value={campaignForm.description}
                  onChange={(event) =>
                    setCampaignForm((form) => ({
                      ...form,
                      description: event.target.value
                    }))
                  }
                  placeholder="What are you raising funds for?"
                  required
                  disabled={!canCreateCampaign || !onExpectedNetwork}
                />
              </label>
              <label>
                Funding goal (whole ETH)
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={campaignForm.goal}
                  onChange={(event) =>
                    setCampaignForm((form) => ({ ...form, goal: event.target.value }))
                  }
                  placeholder="e.g. 5"
                  required
                  disabled={!canCreateCampaign || !onExpectedNetwork}
                />
              </label>
              <button
                className="button button-primary full-width"
                type="submit"
                disabled={!canCreateCampaign || !onExpectedNetwork}
              >
                Create campaign
              </button>
            </form>
          </section>

          {isAdmin && onExpectedNetwork && (
            <section className="panel" id="admin">
              <div className="eyebrow">ADMIN</div>
              <h2>Pending KYC requests</h2>
              {pendingRequests.length === 0 ? (
                <p className="muted">There are no pending requests.</p>
              ) : (
                <div className="request-list">
                  {pendingRequests.map((request) => (
                    <article className="request-card" key={request.user}>
                      <strong>{request.name}</strong>
                      <span className="request-address">{request.user}</span>
                      <span>CNIC: {request.cnic}</span>
                      <div className="request-actions">
                        <button
                          className="button button-primary"
                          onClick={() => decideKYC(request.user, "approve")}
                        >
                          Approve
                        </button>
                        <button
                          className="button button-danger"
                          onClick={() => decideKYC(request.user, "reject")}
                        >
                          Reject
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}
        </aside>
      </div>

      <footer>
        <span>Decentralized Crowdfunding DApp</span>
        <span>Built for local testing on Hardhat</span>
      </footer>
    </main>
  );
}

export default App;
