import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

// A lookup object to get the symbol and decimals for our tokens.
const TOKEN_LOOKUP: { [mint: string]: { symbol: string, decimals: number } } = {
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': { symbol: 'USDC', decimals: 6 },
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': { symbol: 'USDT', decimals: 6 },
};

// Define an interface for the incoming Helius transfer payload.
// The structure is different from an NFT sale.
interface HeliusTransferPayload {
  signature: string;
  tokenTransfers: {
    fromUserAccount: string;
    toUserAccount: string;
    mint: string;
    tokenAmount: number;
  }[];
}

Deno.serve(async (req) => {
  try {
    // 1. RECEIVE AND PARSE THE DATA
    const payloadArray: HeliusTransferPayload[] = await req.json();
    const transferData = payloadArray[0];

    if (!transferData || !transferData.tokenTransfers || transferData.tokenTransfers.length === 0) {
      console.warn("Received incomplete payload:", transferData);
      return new Response("Incomplete payload", { status: 400 });
    }

    // 2. TRANSFORM THE DATA
    // We will process the first relevant token transfer in the transaction.
    const primaryTransfer = transferData.tokenTransfers.find(t => TOKEN_LOOKUP[t.mint]);
    
    if (!primaryTransfer) {
      return new Response("No relevant token transfer found", { status: 200 });
    }

    const tokenInfo = TOKEN_LOOKUP[primaryTransfer.mint];

    const cleanTransfer = {
      signature: transferData.signature,
      token_mint: primaryTransfer.mint,
      token_symbol: tokenInfo.symbol,
      sender: primaryTransfer.fromUserAccount,
      receiver: primaryTransfer.toUserAccount,
      // The amount is sent as an integer, so we adjust for the token's decimals.
      amount: primaryTransfer.tokenAmount / Math.pow(10, tokenInfo.decimals),
    };

    // 3. STORE THE DATA IN SUPABASE
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!
    );

    const { error } = await supabase
      .from('token_transfers') // Insert into our new table
      .insert(cleanTransfer);

    if (error) {
      console.error("Error inserting into Supabase:", error);
      throw new Error(error.message);
    }

    // 4. RESPOND WITH SUCCESS
    console.log(`Successfully processed ${cleanTransfer.token_symbol} transfer:`, cleanTransfer.signature);
    return new Response("Webhook processed successfully!", { status: 200 });

  } catch (err) {
    console.error("Failed to process webhook:", err.message);
    return new Response(`Webhook processing failed: ${err.message}`, { status: 500 });
  }
});


 
    // CREATE TABLE token_transfers (
    //   id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    //   created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    //   signature TEXT NOT NULL,
    //   token_mint TEXT NOT NULL,
    //   token_symbol TEXT NOT NULL,
    //   sender TEXT NOT NULL,
    //   receiver TEXT NOT NULL,
    //   amount NUMERIC(20, 9) NOT NULL
    // );