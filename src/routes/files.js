const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const multer = require('multer');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadPath = req.body.uploadPath || '/storage/emulated/0/Download';
    try {
      await fs.mkdir(uploadPath, { recursive: true });
      cb(null, uploadPath);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    // Keep original filename
    cb(null, file.originalname);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB max file size
  }
});

// Helper function to get file stats
async function getFileStats(filePath) {
  try {
    const stats = await fs.stat(filePath);
    return {
      name: path.basename(filePath),
      path: filePath,
      size: stats.size,
      isDirectory: stats.isDirectory(),
      isFile: stats.isFile(),
      modified: stats.mtime,
      created: stats.birthtime,
      permissions: stats.mode.toString(8).slice(-3)
    };
  } catch (error) {
    return null;
  }
}

// Helper function to format file size
function formatSize(bytes) {
  if (bytes === 0) {
    return '0 Bytes';
  }
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// List files in a directory
router.get('/list', async (req, res) => {
  try {
    const dirPath = req.query.path || '/storage/emulated/0';
    const showHidden = req.query.showHidden === 'true';

    // Check if directory exists
    const dirStats = await fs.stat(dirPath);
    if (!dirStats.isDirectory()) {
      return res.status(400).json({
        error: 'Path is not a directory',
        path: dirPath
      });
    }

    // Read directory contents
    let files = await fs.readdir(dirPath);

    // Filter hidden files if needed
    if (!showHidden) {
      files = files.filter(file => !file.startsWith('.'));
    }

    // Get detailed info for each file
    const fileDetails = await Promise.all(
      files.map(async (file) => {
        const filePath = path.join(dirPath, file);
        const stats = await getFileStats(filePath);
        if (stats) {
          stats.formattedSize = formatSize(stats.size);
        }
        return stats;
      })
    );

    // Filter out null entries and sort
    const validFiles = fileDetails.filter(f => f !== null);
    validFiles.sort((a, b) => {
      // Directories first, then alphabetical
      if (a.isDirectory && !b.isDirectory) {
        return -1;
      }
      if (!a.isDirectory && b.isDirectory) {
        return 1;
      }
      return a.name.localeCompare(b.name);
    });

    res.json({
      currentPath: dirPath,
      parentPath: path.dirname(dirPath),
      files: validFiles,
      count: validFiles.length
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to list files',
      message: error.message
    });
  }
});

// Get file content or download
router.get('/download', async (req, res) => {
  try {
    const filePath = req.query.path;

    if (!filePath) {
      return res.status(400).json({ error: 'File path required' });
    }

    // Check if file exists
    const stats = await fs.stat(filePath);
    if (!stats.isFile()) {
      return res.status(400).json({ error: 'Path is not a file' });
    }

    // Set appropriate headers
    const filename = path.basename(filePath);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', stats.size);

    // Determine content type
    const ext = path.extname(filename).toLowerCase();
    const contentTypes = {
      '.txt': 'text/plain',
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.xml': 'text/xml',
      '.pdf': 'application/pdf',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.mp3': 'audio/mpeg',
      '.mp4': 'video/mp4',
      '.zip': 'application/zip',
      '.apk': 'application/vnd.android.package-archive'
    };

    const contentType = contentTypes[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);

    // Stream the file
    const fileStream = require('fs').createReadStream(filePath);
    fileStream.pipe(res);

  } catch (error) {
    res.status(500).json({
      error: 'Failed to download file',
      message: error.message
    });
  }
});

// Upload files (multiple files supported)
router.post('/upload', upload.array('files', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files provided' });
    }

    const uploadedFiles = req.files.map(file => ({
      originalName: file.originalname,
      filename: file.filename,
      path: file.path,
      size: file.size,
      formattedSize: formatSize(file.size),
      mimetype: file.mimetype
    }));

    res.json({
      message: 'Files uploaded successfully',
      files: uploadedFiles,
      count: uploadedFiles.length
    });

  } catch (error) {
    res.status(500).json({
      error: 'Failed to upload files',
      message: error.message
    });
  }
});

// Delete file or directory
router.delete('/delete', async (req, res) => {
  try {
    const filePath = req.body.path;

    if (!filePath) {
      return res.status(400).json({ error: 'File path required' });
    }

    // Safety check - prevent deletion of critical system directories
    const protectedPaths = [
      '/',
      '/system',
      '/data',
      '/data/data',
      '/storage',
      '/storage/emulated',
      '/storage/emulated/0'
    ];

    if (protectedPaths.includes(filePath)) {
      return res.status(403).json({
        error: 'Cannot delete protected system directory'
      });
    }

    const stats = await fs.stat(filePath);

    if (stats.isDirectory()) {
      await fs.rmdir(filePath, { recursive: true });
    } else {
      await fs.unlink(filePath);
    }

    res.json({
      message: 'File/directory deleted successfully',
      path: filePath
    });

  } catch (error) {
    res.status(500).json({
      error: 'Failed to delete file/directory',
      message: error.message
    });
  }
});

// Create directory
router.post('/mkdir', async (req, res) => {
  try {
    const dirPath = req.body.path;

    if (!dirPath) {
      return res.status(400).json({ error: 'Directory path required' });
    }

    await fs.mkdir(dirPath, { recursive: true });

    res.json({
      message: 'Directory created successfully',
      path: dirPath
    });

  } catch (error) {
    res.status(500).json({
      error: 'Failed to create directory',
      message: error.message
    });
  }
});

// Move or rename file
router.post('/move', async (req, res) => {
  try {
    const { sourcePath, destinationPath } = req.body;

    if (!sourcePath || !destinationPath) {
      return res.status(400).json({
        error: 'Source and destination paths required'
      });
    }

    await fs.rename(sourcePath, destinationPath);

    res.json({
      message: 'File/directory moved successfully',
      from: sourcePath,
      to: destinationPath
    });

  } catch (error) {
    res.status(500).json({
      error: 'Failed to move file/directory',
      message: error.message
    });
  }
});

// Copy file
router.post('/copy', async (req, res) => {
  try {
    const { sourcePath, destinationPath } = req.body;

    if (!sourcePath || !destinationPath) {
      return res.status(400).json({
        error: 'Source and destination paths required'
      });
    }

    const sourceStats = await fs.stat(sourcePath);

    if (sourceStats.isDirectory()) {
      // For directories, use cp command
      await execAsync(`cp -r "${sourcePath}" "${destinationPath}"`);
    } else {
      // For files, use fs.copyFile
      await fs.copyFile(sourcePath, destinationPath);
    }

    res.json({
      message: 'File/directory copied successfully',
      from: sourcePath,
      to: destinationPath
    });

  } catch (error) {
    res.status(500).json({
      error: 'Failed to copy file/directory',
      message: error.message
    });
  }
});

// Get file/directory info
router.get('/info', async (req, res) => {
  try {
    const filePath = req.query.path;

    if (!filePath) {
      return res.status(400).json({ error: 'File path required' });
    }

    const stats = await getFileStats(filePath);

    if (!stats) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Get additional info for files
    if (stats.isFile) {
      stats.formattedSize = formatSize(stats.size);

      // Get file type using 'file' command if available
      try {
        const { stdout } = await execAsync(`file -b "${filePath}"`);
        stats.fileType = stdout.trim();
      } catch {
        stats.fileType = 'Unknown';
      }
    }

    // Get directory contents count
    if (stats.isDirectory) {
      try {
        const files = await fs.readdir(filePath);
        stats.itemCount = files.length;
      } catch {
        stats.itemCount = 0;
      }
    }

    res.json(stats);

  } catch (error) {
    res.status(500).json({
      error: 'Failed to get file info',
      message: error.message
    });
  }
});

// Search for files
router.get('/search', async (req, res) => {
  try {
    const { query, path: searchPath = '/storage/emulated/0', maxResults = 50 } = req.query;

    if (!query) {
      return res.status(400).json({ error: 'Search query required' });
    }

    // Use find command for searching
    const { stdout } = await execAsync(
      `find "${searchPath}" -type f -iname "*${query}*" 2>/dev/null | head -${maxResults}`
    );

    const files = stdout.trim().split('\n').filter(f => f);

    // Get file details
    const fileDetails = await Promise.all(
      files.map(async (filePath) => {
        const stats = await getFileStats(filePath);
        if (stats) {
          stats.formattedSize = formatSize(stats.size);
        }
        return stats;
      })
    );

    res.json({
      query,
      searchPath,
      results: fileDetails.filter(f => f !== null),
      count: fileDetails.filter(f => f !== null).length
    });

  } catch (error) {
    res.status(500).json({
      error: 'Search failed',
      message: error.message
    });
  }
});

module.exports = router;