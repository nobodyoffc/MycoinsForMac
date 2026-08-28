import {fromBase58Check} from '../../crypto/encoding';
import {getPublicKey} from '../../crypto/keys';
import {
  TxInput,
  TxOutput,
  SignedTxResult,
  selectUTXOs,
  signBtcTransaction,
} from '../utxo-common';

function decodeBtcAddress(address: string): Uint8Array {
  const {hash} = fromBase58Check(address);
  return hash;
}

export function buildBtcTransaction(params: {
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
  if (change > 546) {
    outputs.push({address: changeAddress, value: change});
  } else if (change > fee * 5) {
    throw new Error(
      `Change ${change} satoshis would be lost as fee. Adjust the amount.`,
    );
  }

  return signBtcTransaction(selected, outputs, privateKey, publicKey, decodeBtcAddress);
}
