import {fromBase58Check} from '../../crypto/encoding';
import {getPublicKey} from '../../crypto/keys';
import {
  TxInput,
  TxOutput,
  SignedTxResult,
  selectUTXOs,
  signBchTransaction,
  opReturnOutput,
} from '../utxo-common';

function decodeFchAddress(address: string): Uint8Array {
  const {hash} = fromBase58Check(address);
  return hash;
}

export function buildFchTransaction(params: {
  utxos: TxInput[];
  recipients: TxOutput[];
  changeAddress: string;
  feeRate: number;
  privateKey: Uint8Array;
  opReturn?: string; // optional UTF-8 text written into an OP_RETURN output
}): SignedTxResult {
  const {utxos, recipients, changeAddress, feeRate, privateKey, opReturn} =
    params;
  const publicKey = getPublicKey(privateKey, true);

  // Build the OP_RETURN output up front so its size is included in fee estimation.
  // FCH permits 1..4092 bytes of OP_RETURN data (measured in UTF-8 bytes).
  if (opReturn && opReturn.length > 0) {
    const dataBytes = new TextEncoder().encode(opReturn).length;
    if (dataBytes > 4092) {
      throw new Error(
        `OP_RETURN note is ${dataBytes} bytes; FCH allows at most 4092.`,
      );
    }
  }
  const opReturnOut =
    opReturn && opReturn.length > 0 ? opReturnOutput(opReturn) : undefined;
  // OP_RETURN serialized size: 8 (value) + script-len varint + script.
  // The varint is 1 byte for scripts <= 252 bytes, else 3 bytes (0xfd + uint16).
  const opReturnBytes = opReturnOut
    ? 8 + (opReturnOut.script!.length <= 252 ? 1 : 3) + opReturnOut.script!.length
    : 0;
  // Account for change + OP_RETURN outputs in the count used for fee estimation.
  const outputCount = recipients.length + 1 + (opReturnOut ? 1 : 0);

  const totalSend = recipients.reduce((s, r) => s + r.value, 0);
  const {selected, fee} = selectUTXOs(
    utxos,
    totalSend,
    feeRate,
    outputCount,
    opReturnBytes,
  );

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

  // OP_RETURN goes last (data carrier, zero value).
  if (opReturnOut) {
    outputs.push(opReturnOut);
  }

  // FCH uses BCH-style signing (SIGHASH_FORKID) with forkId = 0
  return signBchTransaction(
    selected,
    outputs,
    privateKey,
    publicKey,
    decodeFchAddress,
    0, // forkId
  );
}
