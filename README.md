# Mimic BitcoinJSLib Randstorm

**Version:** 1.0.0

**Description:** This tool exploits a weakness in early Bitcoin wallets, specifically those created between 2011 and 2014, which may have used weak or predictable random number generators. Some of these wallets might be vulnerable to key prediction if the random seed was known or guessed, but this is not guaranteed. The tool is for educational purposes only and should **never** be used on real, production wallets. Always use secure cryptographic methods for key generation.

---

## Features

- **Bitcoin Key Generation:** Generates Bitcoin private keys, public keys, and addresses based on random number generation.
- **Custom Randomness Algorithms:** Simulate different random number generation techniques (e.g., `Math.random()`, custom PRNGs).
- **Brute Force Search:** Searches for matching Bitcoin addresses from a predefined list of target addresses.
- **Telegram Notifications:** Alerts you when a matching address is found, with detailed private key information.
- **Multi-Process Execution:** Supports running multiple processes in parallel for faster brute-forcing.

---

## Table of Contents

1. [Installation](#installation)
2. [Usage](#usage)
   - [Running the Script](#running-the-script)
   - [Choosing Random Algorithm](#choosing-random-algorithm)
3. [Key Generation Logic](#key-generation-logic)
4. [Important Notes](#important-notes)
5. [Security Considerations](#security-considerations)
6. [License](#license)
7. [Disclaimer](#disclaimer)

---

## Installation

To get started, follow these steps:

1. **Clone the repository:**

   ```bash
   git clone https://github.com/yourusername/mimic-bitcoinjslib-randstorm.git
   cd mimic-bitcoinjslib-randstorm
   ```

2. **Install dependencies:**

   Make sure you have [Node.js](https://nodejs.org/) installed. Then, run:
   `npm install`

## Usage

### Running the Script

To start the brute force key generation process, use the following command:
`npm start`

### Running the Script (multi Process using concurrently)

`concurrently \"node index.js 0 1733259991530 1733269991529\"  \"node index.js 1 1733259991530 1733269991529\"  \"node index.js 2 1733259991530 1733269991529\"`

This will run the script with multiple processes, each using different random number generation algorithms. You can also pass custom arguments directly from the command line.

The arguments for the script are:

1.  **Old Random Algorithm choice (0, 1, or 2)**
2.  **Start timestamp in milliseconds**
3.  **End timestamp in milliseconds**

For example, to run with algorithm 1 between two timestamps, use:
`node index.js 1 1733259991530 1733269991529`

### Choosing Random Algorithm

You can choose from three different random number generation algorithms by specifying the first argument: (I have no idea which algo was being used and when. do your research!)

1.  **Algorithm 0:** Uses a simple PRNG based on a linear congruential generator.
2.  **Algorithm 1:** Another PRNG using a different randomness formula.
3.  **Algorithm 2:** A third custom random number generator used in Spider Monkey (not sure exact year).

To choose a different algorithm, modify the first argument in `npm start` or directly pass it when running the script.

### Telegram Notifications

If configured, the script will send notifications to a Telegram bot when it finds a matching Bitcoin address. To enable notifications, set the **Chat ID** and **Secret Token** for your Telegram bot in the code (`telegramChatId` and `telegramSecret`).

---

## Key Generation Logic

The script follows these steps to generate Bitcoin keys:

1.  **Generate a Private Key:** A random 32-byte value is generated as the private key.
2.  **Generate the Public Key:** The public key is derived from the private key using secp256k1 elliptic curve cryptography.
3.  **Generate Bitcoin Address:** The public key is hashed using SHA-256 and RIPEMD-160 to generate the Bitcoin address (either compressed or uncompressed).
4.  **Brute Force Search:** The generated addresses are compared against a list of target addresses (`keysToFind.json`). If a match is found, the private key and address details are saved to a file and sent via Telegram (if configured).

---

## Important Notes

- **Educational Purposes Only:** This tool is for educational use only. It should not be used to attempt unauthorized access to Bitcoin wallets or addresses.
- **Target Addresses:** The script requires a list of Bitcoin addresses to check against. This list should be provided in the `keysToFind.json` file.
- **Security Warning:** This tool is to brute force vulnerabilities in weak random number generation which was then used to generate some early bitcoin wallets. Do not use this tool for generating real Bitcoin keys in production. Always use secure cryptographic libraries and randomness sources in production.
- **No Guarantee of Success:** There is **no guarantee** that you will successfully find matching Bitcoin private keys or addresses using this tool. The process depends on many factors, including randomness and the specific address you're searching for, time, `Math.random` Algorithm was used, and assuming there wasn't any additional entropy added then adding timestamp two time (in first 8 bytes)

---

## Security Considerations

- **Move Funds:** If you suspect that your Bitcoin wallet was generated using insecure randomness (e.g., weak PRNG), **move your funds** to a new wallet immediately.
- **Use Secure Randomness:** For secure key generation in real-world applications, avoid using weak random number generators like `Math.random()` and instead rely on well-established libraries that provide secure randomness.
- **Ethical Use:** This tool is designed for **ethical and educational purposes only**. Any misuse could have legal consequences.

---

## License

This project is licensed under the MIT License - see the LICENSE file for details.

---

## Disclaimer

This tool is for **educational purposes only**. By using this software, you acknowledge that you are using it responsibly and ethically. Unauthorized or malicious use may result in legal consequences, and the author(s) will not be held responsible for any damages arising from its use.

## Support

If you found this tool helpful and would like to support, please consider donating to the following Bitcoin address to encourage further development:

- **Bitcoin Address:** bc1qmd56dyaudv4mzvjmxdgugklpntc3t07527vls3
