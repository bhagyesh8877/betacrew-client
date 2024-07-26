const net = require('net');
const fs = require('fs');

// Connection details
const HOST = '192.168.1.8';
const PORT = 3000;

const client = new net.Socket();
const receivedPackets = [];
const missingSequences = new Set();
let buffer = Buffer.alloc(0);

client.connect(PORT, HOST, () => {
  console.log('Connected to BetaCrew server');
  streamAllPackets();
});

client.on('error', (err) => {
  console.error('Connection error:', err);
});

client.on('data', (data) => {
  buffer = Buffer.concat([buffer, data]);
  processBuffer();
});

client.on('close', () => {
  console.log('Connection closed');
});

function streamAllPackets() {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt8(1, 0); // callType = 1 (Stream All Packets)
  buffer.writeUInt8(0, 1); // resendSeq = 0 (Not used for this call type)
  client.write(buffer);
}

function processBuffer() {
  const packetSize = 17; // Each packet is 17 bytes

  while (buffer.length >= packetSize) {
    const packet = buffer.slice(0, packetSize);
    buffer = buffer.slice(packetSize);

    const symbol = packet.toString('ascii', 0, 4);
    const buySellIndicator = packet.toString('ascii', 4, 5);
    const quantity = packet.readInt32BE(5);
    const price = packet.readInt32BE(9);
    const packetSeq = packet.readInt32BE(13);

    receivedPackets.push({ symbol, buySellIndicator, quantity, price, packetSeq });
  }

  if (buffer.length < packetSize) { // Assuming the last packet will be less than the buffer size
    checkMissingSequences();
  }
}

function checkMissingSequences() {
  receivedPackets.sort((a, b) => a.packetSeq - b.packetSeq);

  let expectedSeq = 1;
  receivedPackets.forEach(packet => {
    while (packet.packetSeq > expectedSeq) {
      missingSequences.add(expectedSeq);
      expectedSeq++;
    }
    expectedSeq++;
  });

  if (missingSequences.size > 0) {
    requestMissingPackets();
  } else {
    generateJSONOutput();
  }
}

function requestMissingPackets() {
  if (missingSequences.size === 0) {
    generateJSONOutput();
    return;
  }

  const seq = missingSequences.values().next().value;
  missingSequences.delete(seq);

  const buffer = Buffer.alloc(2);
  buffer.writeUInt8(2, 0); // callType = 2 (Resend Packet)
  buffer.writeUInt8(seq, 1); // resendSeq = seq

  client.write(buffer);
}

client.on('end', () => {
  if (missingSequences.size > 0) {
    requestMissingPackets();
  } else {
    generateJSONOutput();
  }
});

function generateJSONOutput() {
  const jsonOutput = JSON.stringify(receivedPackets, null, 2);
  fs.writeFileSync('output1.json', jsonOutput);
  console.log('JSON file generated: output.json');
}
