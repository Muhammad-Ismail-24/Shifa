const fs = require('fs');

const path = 'frontend/src/lib/api.ts';
let content = fs.readFileSync(path, 'utf8');

const analyzeStr = export async function analyze(payload: AnalyzeRequest): Promise<AnalyzeResponse> {
  if (!isBackendConfigured) {
    throw new ShifaApiError('network', 'VITE_API_URL is not configured');
  }

  try {
    const { data: initialResponse } = await client.post<{status: string, session_id: string}>('/analyze', payload, {
      timeout: 10_000, 
    });

    const sessionId = initialResponse.session_id;
    if (!sessionId) {
      // Fallback if backend returned immediate response
      return initialResponse as unknown as AnalyzeResponse;
    }

    // Start polling
    while (true) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      const { data: statusData } = await client.get<any>(\/status/\\);
      
      if (statusData.status === 'completed') {
        return statusData.result;
      } else if (statusData.status === 'error') {
        throw new ShifaApiError('server', 'Pipeline error');
      }
      // if 'processing', loop continues
    }

  } catch (err) {
    if (axios.isAxiosError(err)) {
      if (err.code === 'ECONNABORTED') {
        throw new ShifaApiError('timeout', 'Shifa took too long to respond');
      }
      if (err.response) {
        throw new ShifaApiError('server', \Backend returned \\);
      }
    }
    throw new ShifaApiError('network', 'Could not reach Shifa');
  }
};

// Replace the old analyze function
const startIdx = content.indexOf('export async function analyze');
const endIdx = content.indexOf('function allFailed(status: LookupStatus)');

if (startIdx !== -1 && endIdx !== -1) {
    content = content.substring(0, startIdx) + analyzeStr + '\n\n' + content.substring(endIdx);
    fs.writeFileSync(path, content);
    console.log("Patched api.ts successfully");
} else {
    console.log("Could not find analyze function bounds");
}
