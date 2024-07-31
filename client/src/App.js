import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import { Button } from "./components/Button"; 
import { Input } from "./components/Input"; 
import { BASE_URL, SOCKET_URL } from "./config";
import "./App.css";

const socket = io(SOCKET_URL);

export default function App() {
  const [repoURL, setURL] = useState("");
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [projectId, setProjectId] = useState();
  const [deployPreviewURL, setDeployPreviewURL] = useState();
  const [buttonStatus, setButtonStatus] = useState("Build and Deploy");
  const [startedDeployment, setStartedDeployment] = useState(false);

  const logContainerRef = useRef(null);

  const isValidURL = useMemo(() => {
    if (!repoURL || repoURL.trim() === "") return [false, null];
    const regex = new RegExp(
      /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^\/]+)\/([^\/]+)(?:\/)?$/
    );
    return [regex.test(repoURL), "Enter valid Github Repository URL"];
  }, [repoURL]);

  const handleClickDeploy = useCallback(async () => {
    setLoading(true);
    setButtonStatus("Queued");
    setStartedDeployment(true)

    try {
      const result = await fetch(BASE_URL + 'project', {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json'
          },
          body: JSON.stringify({name: 'MYP', gitURL: repoURL})
      })

      const data= await result.json()

      if (data && data.data) {
        const { subdomain } = data.data.project;
        setProjectId(subdomain);
        setDeployPreviewURL(`http://${subdomain}.localhost:8000`);

        console.log(`Subscribing to logs:${subdomain}`);
        socket.emit("subscribe", `logs:${subdomain}`);
      }

      const deploy= await fetch(BASE_URL + 'deploy', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({projectId: data.data.project.id})
      })

    } catch (error) {
      console.error("Error deploying:", error);
      setButtonStatus("Failed");
    } finally {
      setLoading(false);
    }
  }, [projectId, repoURL]);

  const handleSocketIncomingMessage = useCallback((message) => {
    console.log(`[Incoming Socket Message]:`, typeof message, message);

    let log;
    try {
      const parsedMessage = JSON.parse(message);
      log = parsedMessage.log;
    } catch (error) {
      log = message;
    }

    setLogs((prev) => [...prev, log]);
    logContainerRef.current?.scrollIntoView({ behavior: "smooth" });

    if (log.includes("Done")) {
      setButtonStatus("Completed");
      socket.disconnect();
    } else if (log.includes("error")) {
      setButtonStatus("Failed");
      socket.disconnect();
    }
  }, []);

  useEffect(() => {
    socket.on("message", handleSocketIncomingMessage);

    return () => {
      socket.off("message", handleSocketIncomingMessage);
      socket.disconnect();
    };
  }, [handleSocketIncomingMessage]);

  return (
    <main className="container">
      <Input
        disabled={loading}
        value={repoURL}
        onChange={(e) => setURL(e.target.value)}
        type="url"
        placeholder="Github URL"
      />
      
      {!startedDeployment ? (
        <Button
          onClick={handleClickDeploy}
          disabled={!isValidURL[0] || loading}
        >
          {buttonStatus}
        </Button>
      ) : (
        <div className="status-message">
          Status: {buttonStatus}
        </div>
      )}
      {buttonStatus === "Completed" && deployPreviewURL && (
        <div className="preview-url">
          <p>
            Preview URL{" "}
            <a
              target="_blank"
              rel="noopener noreferrer"
              href={deployPreviewURL}
            >
              {deployPreviewURL}
            </a>
          </p>
        </div>
      )}
      {logs.length > 0 && (
        <div className="logs-container">
          <pre>
            {logs.map((log, i) => (
              <code
                ref={logs.length - 1 === i ? logContainerRef : undefined}
                key={i}
              >
                <span className="command-prompt">{`> `}</span>
                {log}
                <br />
              </code>
            ))}
          </pre>
        </div>
      )}
    </main>
  );
}
