import {decodeCashAddr} from '../../crypto/encoding';
import {getPublicKey} from '../../crypto/keys';
import {
  TxInput,
  TxOutput,
  SignedTxResult,
  selectUTXOs,
  signBchTransaction,
} from '../utxo-common';

function decodeBchAddress(address: string): Uint8Array {
  const {hash} = decodeCashAddr(address);
  return hash;
}

export function buildBchTransaction(params: {
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

  // BCH uses SIGHASH_FORKID with forkId = 0
  return signBchTransaction(
    selected,
    outputs,
    privateKey,
    publicKey,
    decodeBchAddress,
    0, // forkId
  );
}
