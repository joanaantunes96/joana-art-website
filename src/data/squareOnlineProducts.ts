// Add only published Square Online product URLs verified against the catalogue item.
// These are public destinations, never Checkout API payment links.
export const squareOnlineProducts: Record<string, { url: string; locationId: string }> = {};
