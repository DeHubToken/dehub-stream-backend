export function verifyFields(requiredFields, data) {
  for (const field of requiredFields) {
    if (!data[field]) {
      throw new Error(`${field} is required for this notification type`);
    }
  }
}