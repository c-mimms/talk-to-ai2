let fetch;

(async () => {
  fetch = (await import('node-fetch')).default;
})();

async function queryGpt(messages) {
  return gpt(messages, 'gpt-3.5-turbo', 0.7, 1000);
  // return gpt(messages, 'gpt-4', 0.7, 1000);
}

async function gpt(messages, model, temperature, maxTokens) {
  const params = { model, messages, temperature, max_tokens: maxTokens };
  const url = 'https://api.openai.com/v1/chat/completions';
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

exports.queryGpt = queryGpt;
