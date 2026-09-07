import re

with open('frontend/src/lib/api.ts', 'r', encoding='utf-8') as f:
    content = f.read()

new_func = """
export async function analyze(payload: AnalyzeRequest): Promise<AnalyzeResponse> {
  if (!isBackendConfigured) {
    throw new ShifaApiError('network', 'VITE_API_URL is not configured');
  }

  try {
    const { data: initialResponse } = await client.post<any>('/analyze', payload, {
      timeout: 10_000, 
    });

    const sessionId = initialResponse.session_id;
    if (!sessionId) {
      return initialResponse as AnalyzeResponse;
    }

    // Polling
    while (true) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      const { data: statusData } = await client.get<any>(/status/);
      
      if (statusData.status === 'completed') {
        return statusData.result;
      } else if (statusData.status === 'error') {
        throw new ShifaApiError('server', 'Pipeline error');
      }
    }

  } catch (err) {
    if (axios.isAxiosError(err)) {
      if (err.code === 'ECONNABORTED') {
        throw new ShifaApiError('timeout', 'Shifa took too long to respond');
      }
      if (err.response) {
        throw new ShifaApiError('server', f"Backend returned {err.response.status}");
      }
    }
    throw new ShifaApiError('network', 'Could not reach Shifa');
  }
}
"""

# wait, there's an f-string in the javascript inside the python script. 
# Let me fix the backticks in the javascript.
new_func = new_func.replace('f"Backend returned {err.response.status}"', 'Backend returned ')
new_func = new_func.replace('/status/', '/status/') # just to be safe

start_idx = content.find('export async function analyze')
end_idx = content.find('function allFailed(status: LookupStatus)')

if start_idx != -1 and end_idx != -1:
    content = content[:start_idx] + new_func + '\n\n' + content[end_idx:]
    with open('frontend/src/lib/api.ts', 'w', encoding='utf-8') as f:
        f.write(content)
    print("Patched api.ts")
else:
    print("Could not find start or end index for api.ts")
