# Account Import/Export System - Installation

## Dependencies

This system requires `better-sqlite3`, a native Node.js SQLite module that requires compilation.

### Windows Installation

On Windows, `better-sqlite3` requires Visual Studio build tools:

1. **Install Visual Studio Build Tools:**
   ```bash
   npm install -g windows-build-tools
   ```
   
   Or download Visual Studio Community and install "Desktop development with C++" workload.

2. **Then install dependencies:**
   ```bash
   npm install
   ```

### Alternative: Use Prebuilt Binaries

If you encounter build issues, you can try using prebuilt binaries:

```bash
npm install better-sqlite3 --build-from-source=false
```

### Linux/macOS Installation

On Linux/macOS, the standard installation should work:

```bash
npm install
```

You may need to install build essentials:
- **Ubuntu/Debian**: `sudo apt-get install build-essential`
- **macOS**: Install Xcode Command Line Tools

## Testing

Run the test suite:

```bash
node tests/accounts-test.js
```

## Files Created

- `src/lib/accounts/schema.js` - Account data schema and validation
- `src/lib/accounts/store.js` - SQLite storage with CRUD operations
- `src/lib/accounts/import.js` - Import parsers (9router, OMNIROUTER, lln)
- `src/lib/accounts/export.js` - JSON export functions
- `tests/accounts-test.js` - Basic test suite

## Usage Example

```javascript
import { accountStore } from "./src/lib/accounts/store.js";
import { importAccounts } from "./src/lib/accounts/import.js";
import { exportToJSON } from "./src/lib/accounts/export.js";

// Import accounts
const data = {
  accounts: [
    { email: "user@example.com", password: "pass123", tier: "pro" }
  ]
};
const result = importAccounts(data, "9router");

// Add to store
accountStore.bulkImport(result.accounts, "9router");

// Export
const exported = exportToJSON();
console.log(exported);
```
