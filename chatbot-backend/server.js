const express = require('express');
const bodyParser = require('body-parser');
const { MongoClient, ObjectId, GridFSBucket } = require('mongodb');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const methodOverride = require('method-override');
const cors = require("cors");

// Create express app
const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(methodOverride('_method'));

// Serve static files from 'backend/dist/chatbot-angular' and 'public' directories
app.use(express.static(path.join(__dirname, 'dist/chatbot-angular')));
app.use(express.static(path.join(__dirname, '../../public')));

// Mongo URI
const mongoURI = 'mongodb+srv://mayank:123123123@cluster0.ard3cot.mongodb.net/mydatabase?retryWrites=true&w=majority';

// Create mongo connection
let bucket;
const client = new MongoClient(mongoURI);
let messagesCollection;

async function connectToMongoDB() {
  try {
    await client.connect();
    const db = client.db('mydatabase');
    bucket = new GridFSBucket(db, { bucketName: 'uploads' });
    messagesCollection = db.collection('messages');
    console.log('Connected to MongoDB');
  } catch (err) {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  }
}

connectToMongoDB();

// Create storage engine
const storage = multer.memoryStorage();
const upload = multer({ storage });

// @route GET /
// @desc Loads chatbot UI
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist/chatbot-angular', 'index.html'));
});

// @route POST /upload
// @desc  Uploads file to DB
app.post('/upload', upload.single('file'), (req, res) => {
  if (!bucket) {
    return res.status(500).send('MongoDB connection is not established');
  }

  const fileBuffer = req.file.buffer;
  const fileName = req.file.originalname;

  crypto.randomBytes(16, (err, buf) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to generate filename' });
    }
    const filename = buf.toString('hex') + path.extname(fileName);
    const uploadStream = bucket.openUploadStream(filename, { contentType: req.file.mimetype });

    uploadStream.end(fileBuffer);

    uploadStream.on('finish', () => {
      res.json({ filename });
    });

    uploadStream.on('error', (err) => {
      res.status(500).json({ error: 'Upload failed' });
    });
  });
});

// @route POST /message
// @desc  Saves message to DB
app.post('/message', async (req, res) => {
  try {
    const { sender, text, attachment } = req.body;
    const message = {
      sender: sender || '',
      text: text || '',
      timestamp: new Date()
    };

    if (attachment) {
      message.attachment = attachment;
    }

    const result = await messagesCollection.insertOne(message);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save message' });
  }
});

// @route GET /messages
// @desc  Fetches all messages from DB
app.get('/messages', async (req, res) => {
  try {
    const messages = await messagesCollection.find({}).toArray();
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// @route GET /files/:filename
// @desc  Display single file object
app.get('/files/:filename', async (req, res) => {
  try {
    const db = client.db('mydatabase');
    const collection = db.collection('uploads.files');

    const file = await collection.findOne({ filename: req.params.filename });
    if (!file || file.length === 0) {
      return res.status(404).json({ err: 'No file exists' });
    }
    return res.json(file);
  } catch (err) {
    res.status(500).send('Error fetching file');
  }
});

// @route GET /image/:filename
// @desc Display Image
app.get('/image/:filename', async (req, res) => {
  try {
    const db = client.db('mydatabase');
    const collection = db.collection('uploads.files');

    const file = await collection.findOne({ filename: req.params.filename });
    if (!file || file.length === 0) {
      return res.status(404).json({ err: 'No file exists' });
    }

    if (file.contentType === 'image/jpeg' || file.contentType === 'image/png') {
      const readstream = bucket.openDownloadStreamByName(file.filename);
      readstream.pipe(res);
    } else {
      res.status(404).json({ err: 'Not an image' });
    }
  } catch (err) {
    res.status(500).send('Error fetching image');
  }
});

// @route GET /file/:filename
// @desc Download file
app.get('/file/:filename', async (req, res) => {
  try {
    const db = client.db('mydatabase');
    const collection = db.collection('uploads.files');

    const file = await collection.findOne({ filename: req.params.filename });
    if (!file || file.length === 0) {
      return res.status(404).json({ err: 'No file exists' });
    }

    const readstream = bucket.openDownloadStreamByName(file.filename);
    readstream.pipe(res);
  } catch (err) {
    res.status(500).send('Error fetching file');
  }
});

// @route DELETE /files/:id
// @desc  Delete file
app.delete('/files/:id', (req, res) => {
  if (!bucket) {
    return res.status(500).send('MongoDB connection is not established');
  }

  bucket.delete(new ObjectId(req.params.id), (err) => {
    if (err) {
      return res.status(404).json({ err: err });
    }

    res.json({ success: true });
  });
});

// @route POST /share-target
// @desc Handle shared data
app.post('/share-target', upload.single('file'), (req, res) => {
  const file = req.file;
  const { name, description, link } = req.body;

  // Here you can handle the uploaded file and other shared data
  console.log('File received:', file);
  console.log('Name:', name);
  console.log('Description:', description);
  console.log('Link:', link);

  // Redirect to the main page or handle the shared data as needed
  res.redirect('/');
});

// Set up server
const port = 3001;
app.listen(port, '0.0.0.0', () => console.log(`Server started on port ${port}`));
