const isInserted = (updatedResult) => updatedResult && updatedResult.upserted && updatedResult.upserted.length > 0;
module.exports = {
    isInserted,
}