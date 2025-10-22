export type Product = {
id: string;
name: string;
priceJPY: number;
imageUrl?: string;
stock?: number;
active?: boolean;
};


export type CartItem = {
productId: string;
name: string;
unitAmount: number;
qty: number;
imageUrl?: string;
};


export type Order = {
id: string;
createdAt: number;
status: "pending" | "paid" | "failed" | "canceled";
amountTotal: number;
currency: "jpy";
lineItems: Array<{
productId: string;
name: string;
unitAmount: number;
qty: number;
}>;
customerEmail?: string;
stripe: {
checkoutSessionId: string;
paymentIntentId?: string;
};
shipping?: {
name?: string;
postalCode?: string;
address1?: string;
address2?: string;
country?: string;
};
siteKey?: string;
};
