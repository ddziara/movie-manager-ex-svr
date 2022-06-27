// import slash from 'slash';
// import WINREG from 'windows-registry';

// const Key = WINREG.Key;
// const windef = WINREG.windef;

// export function getPOSIXDBPathBase(): string {
//     // get path to Cyberlink folder
//     let key = new Key(windef.HKEY.HKEY_CURRENT_USER, 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders', windef.KEY_ACCESS.KEY_READ);
//     let local_app_data: string = key.getValue('Local AppData');
//     key.close();

//     local_app_data = local_app_data.replace('%USERPROFILE%', process.env.USERPROFILE ? process.env.USERPROFILE : '');
//     var db_path_base = local_app_data + "\\CyberLink\\PowerDVD13\\DB1034\\";
//     return slash(db_path_base);
// }

export const getCyberlinkPathBase = (): string => {
  return `C:\\Statler\\new-projects\\movie-manager-ex\\DB1034_test\\`;
};

export const getCyberlinkRootDBPath = (): string => {
  return "";
};

export const getCyberlinkRootDBName = () => {
  //    return "anonymous.db"; // should be ''
  return "";
};
