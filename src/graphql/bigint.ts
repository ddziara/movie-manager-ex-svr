export interface IBigIntInput {
  bigIntStr: string;
}

export interface IBigInt {
  bigIntStr: string;
}

export const unwrapBigInt = (val: IBigInt | undefined): bigint | undefined => {
  let bigIntStr;

  if (val !== undefined) {
    ({ bigIntStr } = val);
  }

  return bigIntStr !== undefined ? BigInt(bigIntStr) : undefined;
};
