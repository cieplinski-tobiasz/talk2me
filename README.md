# talk2me

Real time chat application. It requires from the user to define three questions before the conversation, and then matches the interlocutor basing on the sentiment of the question. The sentiment analysis is made on the client side using SVMs. The conversation then lasts for three minutes, and both sides of the talk are required to answer the predefined questions in order to obtain answers for their questions. The application is designed with microservices architecture and makes use of two-way socket based communication.

## Run
Just type

```
docker-compose up
```

in the main directory. You can connect to the socket using port 80 (it may be changed in future).
