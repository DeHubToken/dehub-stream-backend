require("dotenv").config();
const { ethers } = require("ethers");
const fetch = require("node-fetch");
const abi = require("../abis/StreamNft.json");
async function main() {
  const bscTestProvider = new ethers.providers.JsonRpcProvider(
    process.env.RPC_ENDPOINT,
    { name: "binance", chainId: 97 }
  );
  let wallet = new ethers.Wallet(process.env.TEST_PRIVATE_KEY, bscTestProvider);
  const _mintCount = 3;
  const signature = await wallet.signMessage(`Mint ${_mintCount}`);
  const balance = await wallet.getBalance();
  const contract = new ethers.Contract(
    process.env.DEFAULT_COLLECTION,
    abi,
    wallet
  );

  console.log("--", signature, balance.toString());
  const url = `${process.env.DEFAULT_DOMAIN}/api/user_mint`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mintCount: _mintCount,
      rawSig: signature,
    }),
  });
  const apiResult = await res.json();
  console.log(apiResult);

  const { r, s, v, createdTokenIds, mintCount, timestamp, error } = apiResult;
  if (error) process.exit(0);
  await contract.mint(createdTokenIds, mintCount, timestamp, v, r, s);
  process.exit(0);
}

main()
  .then((r) => {})
  .catch((e) => {
    console.log(e);
  });
