const { exec } = require('child_process');

function getDeviceProperties(callback) {
  exec(
    'getprop 2>/dev/null || echo "getprop command not available"',
    { shell: true },
    (error, stdout, stderr) => {
      if (error) {
        return callback(error);
      }

      if (stdout.includes('not available')) {
        return callback(null, {
          androidVersion: 'N/A',
          sdkVersion: 'N/A',
          device: 'Termux',
          model: 'Android Device',
          manufacturer: 'Unknown',
          buildId: 'N/A',
          buildDate: new Date().toISOString(),
          properties: {}
        });
      }

      const properties = {};
      stdout.split('\n').forEach((line) => {
        const match = line.match(/\[(.*?)\]: \[(.*?)\]/);
        if (match) {
          properties[match[1]] = match[2];
        }
      });

      const result = {
        androidVersion: properties['ro.build.version.release'],
        sdkVersion: properties['ro.build.version.sdk'],
        device: properties['ro.product.device'],
        model: properties['ro.product.model'],
        manufacturer: properties['ro.product.manufacturer'],
        buildId: properties['ro.build.id'],
        buildDate: properties['ro.build.date'],
        properties: properties
      };
      callback(null, result);
    }
  );
}

module.exports = {
  getDeviceProperties
};
