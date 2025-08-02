import server from './server';

server.listen({ port: 3000 }, (err) => {
  if (err) {
    console.error('Server failed to start:', err);
    process.exit(1);
  }
  console.log('Server running on http://localhost:3000');
});
