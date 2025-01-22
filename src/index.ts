import * as fs from "fs/promises";
import * as path from "path";
import dotenv from "dotenv";
import { EtherscanResponse, SourceFiles } from "./types.js";

// Initialize dotenv at the top of your file
dotenv.config();

const OUTPUT_DIR = "./code-review/Gauntlet-wETH-Ecosystem/vault";
const CONTRACT_ADDRESS = "0x5A32099837D89E3a794a44fb131CBbAD41f87a8C";
const API_KEY = process.env.BASESCAN_API_KEY;

if (!API_KEY) {
  throw new Error("BASESCAN_API_KEY is not defined in environment variables");
}

// Make a fetch request to the etherscan api
const response = await fetch(
  `https://api.basescan.org/api?module=contract&action=getsourcecode&address=${CONTRACT_ADDRESS}&apikey=${API_KEY}`
);

const jsonContent = await response.json();

parseEtherscanResponse(jsonContent, OUTPUT_DIR);

async function parseEtherscanResponse(
  response: EtherscanResponse,
  outputDir: string
) {
  try {
    if (response.status !== "1" || !response.result.length) {
      throw new Error("Invalid Etherscan response");
    }

    await fs.mkdir(outputDir, { recursive: true });
    const contract = response.result[0];
    let sourceFiles: SourceFiles;

    try {
      // First try to parse the source code directly
      const sourceCodeStr = contract.SourceCode.trim().replace(/\r/g, "");

      // // Debug log the source code
      // console.log("Raw source code:", sourceCodeStr.substring(0, 200) + "...");

      // Handle the case where the source code is wrapped in double curly braces {{...}}
      let jsonStr = sourceCodeStr;
      if (sourceCodeStr.startsWith("{{") && sourceCodeStr.endsWith("}}")) {
        // Remove outer double curly braces but keep the inner ones
        jsonStr = sourceCodeStr.slice(1, -1).trim().replace(/\r/g, "");
      } else if (!sourceCodeStr.startsWith("{")) {
        // Only wrap in content object if it's not JSON at all
        jsonStr = `{"content": ${JSON.stringify(sourceCodeStr)}}`;
      }

      // // Debug log the processed JSON string
      // console.log("Processed JSON string:", jsonStr.substring(0, 200) + "...");

      // Try parsing the JSON string
      const parsedData = JSON.parse(jsonStr);

      // Handle different source code formats
      if (parsedData.sources) {
        sourceFiles = parsedData.sources;
      } else if (parsedData.content) {
        // Single file case
        sourceFiles = {
          [contract.ContractName + ".sol"]: { content: parsedData.content },
        };
      } else {
        // Direct mapping case
        sourceFiles = parsedData;
      }

      // Debug log the parsed structure
      console.log("Source files structure:", Object.keys(sourceFiles));

      // Validate the structure
      for (const [filename, fileData] of Object.entries(sourceFiles)) {
        if (!fileData || typeof fileData.content !== "string") {
          throw new Error(`Invalid content for file ${filename}`);
        }
      }
    } catch (e) {
      console.error("Failed to parse source code:", e);
      throw e;
    }

    // Write each file
    for (const [filename, fileData] of Object.entries(sourceFiles)) {
      const filePath = path.join(outputDir, filename);

      // Create directory if it doesn't exist
      await fs.mkdir(path.dirname(filePath), { recursive: true });

      // Ensure we have content before writing
      if (!fileData.content) {
        console.warn(`No content found for file ${filename}, skipping...`);
        continue;
      }

      // Write the Solidity content directly
      await fs.writeFile(filePath, fileData.content, "utf8");
    }

    return {
      name: contract.ContractName,
      files: Object.keys(sourceFiles),
    };
  } catch (error) {
    console.error("Error parsing Etherscan response:", error);
    throw error;
  }
}
