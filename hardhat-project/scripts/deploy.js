const fs = require("node:fs");
const path = require("node:path");
const { ethers, artifacts, network } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  const chainId = Number((await ethers.provider.getNetwork()).chainId);

  const KYCRegistry = await ethers.getContractFactory("KYCRegistry_Waleed");
  const registry = await KYCRegistry.deploy();
  await registry.waitForDeployment();

  const Crowdfunding = await ethers.getContractFactory("Crowdfunding_Waleed");
  const crowdfunding = await Crowdfunding.deploy(await registry.getAddress());
  await crowdfunding.waitForDeployment();

  const [registryArtifact, crowdfundingArtifact] = await Promise.all([
    artifacts.readArtifact("KYCRegistry_Waleed"),
    artifacts.readArtifact("Crowdfunding_Waleed")
  ]);
  const output = {
    network: network.name,
    chainId,
    admin: deployer.address,
    contracts: {
      KYCRegistry_Waleed: {
        address: await registry.getAddress(),
        abi: registryArtifact.abi
      },
      Crowdfunding_Waleed: {
        address: await crowdfunding.getAddress(),
        abi: crowdfundingArtifact.abi
      }
    }
  };
  const outputPath = path.resolve(
    __dirname,
    "../../frontend/src/contracts/contracts.json"
  );
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);

  console.log(`KYCRegistry_Waleed deployed to ${await registry.getAddress()}`);
  console.log(`Crowdfunding_Waleed deployed to ${await crowdfunding.getAddress()}`);
  console.log(`Contract addresses and ABIs written to ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
