require("dotenv").config();
const { ethers } = require("ethers");
const fetch = require("node-fetch");
const { encryptWithSourceKey, decryptWithSourceKey } = require("../utils/encrypt");
// const abi = require("../abi/TheNumberGame.json");
async function main() {
  const bscTestProvider = new ethers.providers.JsonRpcProvider(
    process.env.RPC_ENDPOINT,
    { name: "binance", chainId: 97 }
  );
  let wallet = new ethers.Wallet(process.env.TEST_PRIVATE_KEY, bscTestProvider);
  const _mintCount = 3;
  const timestamp = Date.now();
  const address = wallet.address.toLowerCase();
  const signedMsg = `${address}-${timestamp}`;
  console.log("---signed msg", signedMsg);
  const signature = await wallet.signMessage(signedMsg);
  const balance = await wallet.getBalance();
  //   const contract = new ethers.Contract(
  //     process.env.DEFAULT_COLLECTION,
  //     abi,
  //     wallet
  //   );
  const data = { email: "xx@gmail.com", username: "test1" };
  const encryptedData = encryptWithSourceKey(JSON.stringify(data), signature);
  console.log("--", signature, balance.toString());
  /**
   * testing register
   */
  let url = `${process.env.DEFAULT_DOMAIN}/api/register`;
  let res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      address: address,
      sig: signature,
      timestamp: timestamp,
      data: encryptedData,
    }),
  });
  let apiResult = await res.json();
  console.log(apiResult);

  url = `${process.env.DEFAULT_DOMAIN}/api/user_info`;
  res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      address: address,
      sig: signature,
      timestamp: timestamp,
      // data: encryptedData,
    }),
  });
  apiResult = await res.json();
  console.log("userInfo: result", apiResult);
  if(apiResult?.result?.data)
  {
    console.log(decryptWithSourceKey(apiResult?.result?.data, signature));
  }
  

  //   const { r, s, v, createdTokenIds, mintCount, timestamp, error } = apiResult;
  process.exit(0);
  //   await contract.mint(createdTokenIds, mintCount, timestamp, v, r, s);
  //   process.exit(0);
}

main()
  .then((r) => { })
  .catch((e) => {
    console.log(e);
  });
