# Instructions for Running the Script using ts-node

Here is an outline on how to run the TypeScript script given, using \`ts-node\`.

## Prerequisites

- Ensure that you have `Node.js` and `npm` (Node Package Manager) installed in your system. You can download these from [here](https://nodejs.org/en/download/).

- You will need an npm authentication token to run this script without errors. See [npm authToken](https://docs.npmjs.com/creating-and-viewing-authentication-tokens) for detailed information on obtaining it. Your npm configuration file, containing the token, should be located at `~/.npmrc`.

- You also need to provide the name of the organization as a command-line argument. This is used for package retrieval from the NPM registry.

## Installation Steps

1. Install `ts-node` globally using npm:
   ```
   npm install -g typescript ts-node
   ```
2. Navigate to the directory containing your TypeScript file and install the required dependencies:
   ```
   cd /path/to/directory
   npm install npm-registry-fetch fs path cli-progress
   ```

## Run the Script

Finally, you can run the script using `ts-node` as:
```bash
npx ts-node main.ts 'organization-name'
```
Replace 'organization-name' with the actual organization name.

After running the script, a CSV file named `package-sizes.csv` will be created in the current directory, containing information on the size of each package in the given organization. Data will also be printed to the console.

Please note that optional error handlers are placed in several places in the script to catch and log any potential errors.
