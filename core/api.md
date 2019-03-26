# Connection

In order to connect to the socket API, Authorization header must be present in the handshake.

The header must contain valid token from authorization microservice.

If the header is not present or the header is present, but is not valid,
socket will respond with `error` event and a message.

# Pre-talk

Client has to initiate the communication by sending the `find` event with questions and score in JSON as payload:

```json
{
  "score": 0.3,
  "questions": [
      {
        "id": 1,
        "question": "Am I interesting?"
      },
      {
        "id": 2,
        "question": "Am I boring?"
      },
      {
        "id": 3,
        "question": "Did you like the talk?"
      }
  ]
}
```

The client is enqueued. If the match is found, the server responds with `match` event,
containing the name and id of the talk partner and `match_id` as payload:

```json
{
  "username": "viper",
  "user_id": 5,
  "match_id": "123e4567-e89b-12d3-a456-426655440000"
}
```

Now the server waits for a given time for a `confirm` event from the client.
The event *must* have a payload, consisting of the `match_id` passed to the client.

```json
{
  "match_id": "123e4567-e89b-12d3-a456-426655440000"
}
```

When both sides are willing to talk to each other,
i.e. server receives confirmation from both sides,
server sends `chat-start` event with no payload.
From now on, server will accept talk-related events from the client.

At anytime during the pre-talk phase, server can send an `error` event,
caused by lack of match or timeout during confirmation wait.
After the `error` event is sent, client is disconnected from the server.

# Talk

During the talk phase, client can send `message` events with given payload:

```json
{
  "message": "Hi, how are you?"
}
```

Again, at anytime server may send an `error` event and disconnect the client.
For example, this could happen if the person that the client is talking to disconnects.

# Post-talk

After given time, server will send `chat-stop` event with questions of the other side to answer to:

```json
{
  "questions": [
      {
        "id": 1,
        "question": "Am I interesting?"
      },
      {
        "id": 2,
        "question": "Am I boring?"
      },
      {
        "id": 3,
        "question": "Did you like the talk?"
      }
  ]
}
```

After the `chat-stop` event is sent, server *will not* accept any other `message` events.
The only event, that will not cause an `error` event from server is `answers` event:

```json
{
  "match_id": "123e4567-e89b-12d3-a456-426655440000",
  "answers": [
    {
      "question_id": 1,
      "answer": "Yes."
    },
    {
      "question_id": 2,
      "answer": "No."
    },
    {
      "question_id": 3,
      "answer": "Yes."
    }
  ]
}
```

The client *must* answer to all the questions asked by client.

If the answers are sent by both sides, they are forwarded to the clients,
and the clients are disconnected.

If any side does not send the answers, `error` event is raised and clients are disconnected.