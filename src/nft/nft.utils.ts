// utils.ts

import { arrayify, CategoryModel, ethers, removeDuplicatedElementsFromArray } from "./nft.imports";


export async function handleCategoryDuplication(category: string[]): Promise<string[]> {
    const uniqueCategories = removeDuplicatedElementsFromArray(category);
    const existingCategories = await CategoryModel.find({ name: { $in: uniqueCategories } }).distinct('name');
    const newCategories = uniqueCategories.filter(cat => !existingCategories.includes(cat));

    if (newCategories.length > 0) {
        await CategoryModel.insertMany(newCategories.map(name => ({ name })));
    }
    return existingCategories;
}

export async function createMintingSignature(collectionAddress: string, tokenId: string, chainId: number, totalSupply: number, timestamp: number) {
    const messageHash = ethers.solidityPackedKeccak256(
        ['address', 'uint256', 'uint256', 'uint256', 'uint256'],
        [collectionAddress, tokenId, chainId, totalSupply, timestamp],
    );
    const signer = new ethers.Wallet(process.env.SIGNER_KEY || '')
    return signer.signMessage(arrayify(messageHash))
}
