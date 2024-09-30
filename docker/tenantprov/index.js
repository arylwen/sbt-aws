const { exec } = require('child_process');
const fs = require('fs');
const util = require('util');

const execAsync = util.promisify(exec);
const writeFileAsync = util.promisify(fs.writeFile);

exports.handler = async function (event) {
  try {
    // Define the script content
    const scriptContent = event.script || '#!/bin/bash\necho "No script provided!"';

    // Save the script to /tmp/prov-script.sh
    const scriptPath = '/tmp/prov-script.sh';
    await writeFileAsync(scriptPath, scriptContent, { mode: 0o755 });

    // Run the script and get output
    const { stdout, stderr } = await execAsync(`/bin/bash ${scriptPath}`);

    // Handle stderr as error
    if (stderr) {
      throw new Error(`Script execution error: ${stderr}`);
    }

    return { output: stdout };
  } catch (error) {
    return { error: error.message };
  }
};
