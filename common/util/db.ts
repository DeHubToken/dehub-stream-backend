const isInserted = (updatedResult) => updatedResult && updatedResult.upserted && updatedResult.upserted.length > 0;
const isUpdated = (updatedResult) => updatedResult && updatedResult.nModified > 0;

export {
    isInserted,
    isUpdated
}