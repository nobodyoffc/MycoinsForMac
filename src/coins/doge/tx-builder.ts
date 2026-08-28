import {fromBase58Check} from '../../crypto/encoding';
import {getPublicKey} from '../../crypto/keys';
import {
  TxInput,
  TxOutput,
  SignedTxResult,
  selectUTXOs,
  signBtcTransaction,
} from '../utxo-common';

function decodeDogeAddress(address: string): Uint8Array {
  const {hash} = fromBase58Check(address);
  return hash;
}

const DOGE_DUST_LIMIT = 1000000; // 0.01 DOGE in koinu

export function buildDogeTransaction(params: {
  utxos: TxInput[];
  recipients: TxOutput[];
  changeAddress: string;
  feeRate: number;
  privateKey: Uint8Array;
}): SignedTxResult {
  const {utxos, recipients, changeAddress, feeRate, privateKey} = params;
  const publicKey = getPublicKey(privateKey, true);

  const totalSend = recipients.reduce((s, r) => s + r.value, 0);
  const {selected, fee} = selectUTXOs(utxos, totalSend, feeRate, recipients.length + 1);

  const totalInput = selected.reduce((s, u) => s + u.value, 0);
  const change = totalInput - totalSend - fee;

  const outputs: TxOutput[] = [...recipients];
  if (change > DOGE_DUST_LIMIT) {
    outputs.push({address: changeAddress, value: change});
  } else if (change > fee * 5) {
    // Change is above dust but would result in excessive fee — refuse
    throw new Error(
      `Change ${change} koinu would be lost as fee. Adjust the amount.`,
    );
  }

  // DOGE uses same signing as BTC (no SIGHASH_FORKID)
  return signBtcTransaction(
    selected,
    outputs,
    privateKey,
    publicKey,
    decodeDogeAddress,
    2, // version
    0, // lockTime
  );
}
