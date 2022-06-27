function pad(num: number) {
  if (num < 10) {
    return "0" + num;
  }
  return num;
}

export function dateToUTCString(date: Date) {
  return (
    date.getUTCFullYear() +
    "-" +
    pad(date.getUTCMonth() + 1) +
    "-" +
    pad(date.getUTCDate()) +
    " " +
    pad(date.getUTCHours()) +
    ":" +
    pad(date.getUTCMinutes()) +
    ":" +
    pad(date.getUTCSeconds()) +
    "." +
    (date.getUTCMilliseconds() / 1000).toFixed(6).slice(2, 8)
  );
}

//=================================================================================

export enum StringCaseMode {
  KeepCurrent,
  ToLowerCase,
}

export const convertStringCase = (
  txt: string,
  caseMode: StringCaseMode
): string => {
  if (caseMode === StringCaseMode.ToLowerCase) {
    return txt.toLowerCase();
  }

  return txt;
};
