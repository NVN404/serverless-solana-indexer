import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

// Define the threshold for what we consider a "whale" transfer.
const WHALE_THRESHOLD_SOL = 1000;

interface HeliusNativeTransferPayload {
  signature: string;
  nativeTransfers: {
    fromUserAccount: string;
    toUserAccount: string;
    amount: number; // Amount in lamports
  }[];
}

Deno.serve(async (req) => {
  try {
    const bodyText = await req.text();
    if (!bodyText) {
      return new Response("Request body is empty", { status: 400 });
    }

    const payloadArray: HeliusNativeTransferPayload[] = JSON.parse(bodyText);
    const transferData = payloadArray[0];

    if (!transferData || !transferData.nativeTransfers) {
      return new Response("Invalid payload", { status: 400 });
    }

    // Find transfers that are above our threshold.
    const whaleTransfers = transferData.nativeTransfers
      .map(t => ({
        ...t,
        amount_sol: t.amount / 1_000_000_000, // Convert lamports to SOL
      }))
      .filter(t => t.amount_sol >= WHALE_THRESHOLD_SOL);

    if (whaleTransfers.length === 0) {
      return new Response("No whale transfers found", { status: 200 });
    }
    
    // Prepare the data for insertion.
    const cleanTransfers = whaleTransfers.map(t => ({
        signature: transferData.signature,
        sender: t.fromUserAccount,
        receiver: t.toUserAccount,
        amount_sol: t.amount_sol,
    }));

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!
    );

    const { error } = await supabase.from('sol_transfers').insert(cleanTransfers);

    if (error) {
      throw new Error(error.message);
    }

    console.log(`Successfully processed ${cleanTransfers.length} SOL whale transfer(s).`);
    return new Response("Webhook processed successfully!", { status: 200 });

  } catch (err) {
    console.error("Failed to process webhook:", err.message);
    return new Response(`Webhook processing failed: ${err.message}`, { status: 500 });
  }
});


// CREATE TABLE sol_transfers (
//   id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
//   created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
//   signature TEXT NOT NULL,
//   sender TEXT NOT NULL,
//   receiver TEXT NOT NULL,
//   amount_sol NUMERIC(20, 9) NOT NULL
// );

