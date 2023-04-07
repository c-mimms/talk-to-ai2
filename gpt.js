import 'node-fetch';
import { createParser } from 'eventsource-parser'

const url = 'https://api.openai.com/v1/chat/completions';

export async function queryGpt(messages) {
  var model = 'gpt-3.5-turbo';
  // var model = 'gpt-4';
  var temperature = 0.7;
  var maxTokens = 1000;

  const params = { model, messages, temperature, max_tokens: maxTokens };
  const headers = {
    Authorization: `Bearer redacted`,
    'Content-Type': 'application/json',
  };

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });

  const json = await response.json();

  if (json.choices && json.choices[0] && json.choices[0].message) {
    return json.choices[0].message.content;
  } else {
    console.error('Error: Unexpected API response format', json);
    return 'ERROR';
  }
}

export async function streamGpt(messages, callback) {
  let response = await fetch(url,
    {
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer SECRET`
      },
      method: "POST",
      body: JSON.stringify({
        // model: "gpt-4",
        model: 'gpt-3.5-turbo',
        messages: messages,
        temperature: 0.75,
        max_tokens: 500,
        stream: true,
      }),
    });

  console.log("Streaming");

  const parser = createParser(thing => {
    var piece = onParse(thing);
    if (piece) {
      callback(piece);
    }
  });
  for await (const value of response.body?.pipeThrough(new TextDecoderStream())) {
    parser.feed(value);
  }
}

function onParse(event) {
  if (event.type === 'event') {
    if (event.data !== "[DONE]") {
      return JSON.parse(event.data).choices[0].delta?.content || "";
    }
  } else if (event.type === 'reconnect-interval') {
    console.log('We should set reconnect interval to %d milliseconds', event.value)
  }
}
