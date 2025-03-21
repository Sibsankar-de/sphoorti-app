
// sleep function
export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// checks for alpha numeric
export function isAlphaNumeric(str) {
    return /^[a-zA-Z0-9]+$/.test(str);
}

export const isAlphabet = (str) => /^[A-Za-z]+$/.test(str);

export const isNumber = (str) => /^[0-9]+$/.test(str);