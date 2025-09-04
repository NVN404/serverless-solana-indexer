import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

// Define an interface for the incoming Helius webhook payload.
// This helps TypeScript know the shape of the data we're expecting.
interface HeliusSalePayload {
  signature: string;
  events: {
    nft: {
      seller: string;
      buyer: string;
      amount: number;
      nfts: {
        mint: string;
      }[];
    };
  };
  collection?: string;
}

// The main Deno server function that handles incoming requests.
Deno.serve(async (req) => {
  // 1. AUTHENTICATION (Optional but recommended for production)
  // For simplicity, we'll skip checking an auth header, but you would add that here.

  try {
    // 2. RECEIVE AND PARSE THE DATA
    // Helius sends data as a JSON array, even if it's just one transaction.
    const payloadArray: HeliusSalePayload[] = await req.json();
    const saleData = payloadArray[0]; // We'll process the first transaction in the payload.

    // Check if the payload has the necessary data.
    if (!saleData || !saleData.events.nft || !saleData.signature) {
      console.warn("Received incomplete payload:", saleData);
      return new Response("Incomplete payload", { status: 400 });
    }

    // 3. TRANSFORM THE DATA
    // Extract the clean data we want to store.
    const cleanSale = {
      signature: saleData.signature,
      buyer: saleData.events.nft.buyer,
      seller: saleData.events.nft.seller,
      // Helius sends the price in lamports (1 SOL = 1,000,000,000 lamports).
      // We convert it to SOL for easier use.
      price_sol: saleData.events.nft.amount / 1_000_000_000,
      // The first NFT in the `nfts` array is the one that was sold.
      mint_address: saleData.events.nft.nfts[0].mint,
      // The collection info might not always be present, so we handle that case.
      collection: saleData.collection || "Unknown",
    };

    // 4. STORE THE DATA IN SUPABASE
    // Create a Supabase client to interact with our database.
    // The URL and anon key are environment variables managed by Supabase.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!
    );

    // Insert the clean data into our 'nft_sales' table.
    const { data, error } = await supabase
      .from('nft_sales')
      .insert(cleanSale);

    if (error) {
      console.error("Error inserting into Supabase:", error);
      throw new Error(error.message);
    }

    // 5. RESPOND WITH SUCCESS
    // Let Helius know that we successfully processed the webhook.
    console.log("Successfully processed sale for signature:", cleanSale.signature);
    return new Response("Webhook processed successfully!", { status: 200 });

  } catch (err) {
    // If anything goes wrong, log the error and send a failure response.
    console.error("Failed to process webhook:", err.message);
    return new Response(`Webhook processing failed: ${err.message}`, { status: 500 });
  }
});