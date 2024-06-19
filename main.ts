import fetch from 'npm-registry-fetch';
import fs from 'fs';
import path from 'path';
import cliProgress from 'cli-progress';

/**
 * Represents the name of an organization.
 *
 * @param {string} orgName - The name of the organization.
 * @returns {void}
 */
const orgName = process.argv[2];
if (!orgName) {
  console.error('Please provide the organization name as a command-line argument.');
  process.exit(1);
}

/**
 * Retrieves the npm authentication token from the npm configuration file.
 * The npm configuration file should be located at ~/.npmrc.
 *
 * @returns {string | null} - The npm authentication token if found, otherwise null.
 */
const getNpmToken = (): string | null => {
  try {
    const npmrcPath = path.resolve(process.env.HOME || process.env.USERPROFILE || '', '.npmrc');
    const npmrcContent = fs.readFileSync(npmrcPath, 'utf-8');
    const match = npmrcContent.match(/\/\/registry\.npmjs\.org\/:_authToken=(.*)/);
    return match ? match[1].trim() : null;
  } catch (error) {
    console.error('Failed to read npm token from ~/.npmrc:', error);
    return null;
  }
};

/**
 * Retrieves the npm token used for authenticating with the npm registry.
 *
 * @returns {string} The npm token.
 */
const npmToken = getNpmToken();
if (!npmToken) {
  console.error('Failed to retrieve npm token from ~/.npmrc');
  process.exit(1);
}

/**
 * Object representing the fetch options.
 *
 * @typedef {Object} FetchOptions
 * @property {Object} headers - The headers of the HTTP request.
 * @property {string} headers.Authorization - The authorization token.
 * @property {string} registry - The URL of the npm registry.
 */
const fetchOpts = {
  headers: {
    Authorization: `Bearer ${npmToken}`
  },
  registry: 'https://registry.npmjs.org/'
};

/**
 * Represents information about the size of a package.
 * @interface
 */
interface PackageSizeInfo {
  name: string;
  size: string;
  rawSize: number;
}

/**
 * Determines whether the given value is an instance of the Error class.
 *
 * @param {unknown} error - The value to be checked.
 * @returns {boolean} - true if the value is an instance of the Error class, otherwise false.
 */
const isError = (error: unknown): error is Error => {
  return error instanceof Error;
};

/**
 * Function to format bytes to human-readable format.
 * @param {number} bytes - The number of bytes to be formatted.
 * @returns {string} - The formatted bytes.
 */
const formatBytes = (bytes: number): string => {
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  if (bytes === 0) return '0 Byte';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
};

/**
 * Retrieves the size information of a given package from the NPM registry.
 *
 * @param {string} packageName - The name of the package.
 * @returns {Promise<PackageSizeInfo | null>} - The package size information, or null if the package is not found or an error occurred.
 */
const getPackageSize = async (packageName: string): Promise<PackageSizeInfo | null> => {
  try {
    const encodedPackageName = encodeURIComponent(packageName);
    const packageInfoUrl = `https://registry.npmjs.org/${encodedPackageName}`;
    const packageInfo = await fetch.json(packageInfoUrl, fetchOpts) as Record<string, any>;

    const latest = packageInfo['dist-tags']?.latest;
    if (!latest) {
      return null;
    }

    const versionInfo = packageInfo.versions[latest];
    const size = versionInfo?.dist?.unpackedSize;
    if (typeof size !== 'number') {
      return null;
    }

    return {
      name: packageName,
      size: formatBytes(size),
      rawSize: size
    };
  } catch (error) {
    if (isError(error)) {
      if (error.message.includes('404')) {
        console.error(`Package ${packageName} not found (404)`);
      } else {
        console.error(`Failed to fetch size for package ${packageName}: ${error.message}`);
      }
    } else {
      console.error(`Failed to fetch size for package ${packageName}: An unknown error occurred.`);
    }
    return null;
  }
};

/**
 * Retrieves a list of packages for a given organization from the npm registry.
 *
 * @param {string} org - The name of the organization.
 * @returns {Promise<string[]>} - A promise that resolves with an array of package names.
 * @throws {Error} - If the response format is unexpected.
 *
 * Examples:
 *
 *  listOrgPackages('my-org').then(packages => {
 *    console.log(packages); // ['package1', 'package2', 'package3']
 *  }).catch(error => {
 *    console.error(error.message);
 *  });
 */
const listOrgPackages = async (org: string): Promise<string[]> => {
  try {
    const orgPackagesUrl = `https://registry.npmjs.org/-/org/${org}/package`;
    const response = await fetch.json(orgPackagesUrl, fetchOpts) as Record<string, unknown>;
    if (response && typeof response === 'object' && !Array.isArray(response)) {
      return Object.keys(response);
    } else {
      throw new Error('Unexpected response format');
    }
  } catch (error) {
    if (isError(error)) {
      console.error(`Failed to list packages for org ${org}: ${error.message}`);
    } else {
      console.error(`Failed to list packages for org ${org}: An unknown error occurred.`);
    }
    return [];
  }
};

/**
 * Writes the given data to a CSV file at the specified file path.
 *
 * @param {string} filePath - The path to the CSV file.
 * @param {PackageSizeInfo[]} data - An array of objects representing the package size information.
 * @throws {Error} If there is an error writing the CSV file.
 */
const writeCSV = (filePath: string, data: PackageSizeInfo[]) => {
  const header = 'Package Name,Size (Bytes),Size (Pretty)\n';
  const rows = data.map(pkg => `${pkg.name},${pkg.rawSize},${pkg.size}`).join('\n');
  fs.writeFileSync(filePath, header + rows);
};

/**
 * Executes the main function.
 *
 * This function retrieves a list of packages for an organization,
 * fetches the size of each package, sorts the packages by size,
 * and outputs the results to both a CSV file and the console.
 * If an error occurs during processing, it will be caught and logged.
 *
 * @returns {Promise<void>}
 */
const main = async () => {
  try {
    const packages = await listOrgPackages(orgName);
    const bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
    bar.start(packages.length, 0);

    const packageSizesPromises = packages.map(pkg => getPackageSize(pkg).finally(() => bar.increment()));
    const packageSizesResults = await Promise.all(packageSizesPromises);
    bar.stop();

    const packageSizes: PackageSizeInfo[] = packageSizesResults.filter(
      (sizeInfo): sizeInfo is PackageSizeInfo => sizeInfo !== null
    );

    packageSizes.sort((a, b) => b.rawSize - a.rawSize);
    const filePath = path.resolve(__dirname, 'package-sizes.csv');
    writeCSV(filePath, packageSizes);
    console.log('CSV file created: package-sizes.csv');
    console.table(packageSizes.map(({ name, size, rawSize }) => ({ name, rawSize, size })));
  } catch (error) {
    if (isError(error)) {
      console.error('Error during processing:', error.message);
    } else {
      console.error('Error during processing: An unknown error occurred.');
    }
  }
};

main();
