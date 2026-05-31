package server;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;
import java.io.*;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.*;
import java.util.concurrent.*;
import logger.*;

public class Server {
    private static final int DEFAULT_PORT = 8080;
    private static String dashboardDir;

    public static void main(String[] args) throws Exception {
        int port = DEFAULT_PORT;
        if (args.length > 0) {
            try {
                port = Integer.parseInt(args[0]);
            } catch (NumberFormatException e) {
                // Keep default port
            }
        }

        // Locate dashboard assets
        String userDir = System.getProperty("user.dir");
        dashboardDir = new File(userDir, "dashboard").getAbsolutePath();
        System.out.println("Serving dashboard from: " + dashboardDir);

        // Setup default logger configurations
        setupDefaultLoggerConfig();

        // Start HttpServer
        HttpServer server = HttpServer.create(new InetSocketAddress(port), 0);
        server.setExecutor(Executors.newCachedThreadPool());

        // Map endpoints
        server.createContext("/api/events", new SseHandler());
        server.createContext("/api/config", new ConfigHandler());
        server.createContext("/api/simulate", new SimulateHandler());
        server.createContext("/api/simulate/stop", new StopSimulateHandler());
        server.createContext("/", new StaticFileHandler());

        System.out.println("Logging Service Dashboard running at http://localhost:" + port);
        server.start();

        // Add shutdown hook to release workers
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            System.out.println("\nShutting down server...");
            SimulationRunner.stopAllSimulations();
            LoggerManager.reset();
            server.stop(0);
        }));
    }

    private static void setupDefaultLoggerConfig() {
        Logger root = LoggerManager.getLogger("root");
        
        // 1. Sync console sink
        Destination consoleDest = new Destination(
            new PlainTextFormatter(),
            LogLevel.DEBUG,
            new ConsoleSink(),
            false,
            100,
            QueueBackpressurePolicy.BLOCK
        );
        root.addDestination(consoleDest);

        // 2. Async file sink (queue cap 10, blocks on full)
        try {
            Destination fileDest = new Destination(
                new PlainTextFormatter(),
                LogLevel.WARN,
                new FileSink("app.log"),
                true,
                10,
                QueueBackpressurePolicy.BLOCK
            );
            root.addDestination(fileDest);
        } catch (IOException e) {
            System.err.println("Failed to build default FileSink: " + e.getMessage());
        }
    }

    // --- STATIC FILES HANDLER ---
    private static class StaticFileHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (!"GET".equalsIgnoreCase(exchange.getRequestMethod())) {
                sendErrorResponse(exchange, 405, "Method Not Allowed");
                return;
            }

            String path = exchange.getRequestURI().getPath();
            if ("/".equals(path)) {
                path = "/index.html";
            }

            File file = new File(dashboardDir, path.substring(1));
            // Path traversal security check
            if (!file.getAbsolutePath().startsWith(dashboardDir)) {
                sendErrorResponse(exchange, 403, "Access Denied");
                return;
            }

            if (!file.exists() || file.isDirectory()) {
                sendErrorResponse(exchange, 404, "File Not Found");
                return;
            }

            String contentType = "text/plain";
            if (path.endsWith(".html")) contentType = "text/html";
            else if (path.endsWith(".css")) contentType = "text/css";
            else if (path.endsWith(".js")) contentType = "application/javascript";
            else if (path.endsWith(".json")) contentType = "application/json";
            else if (path.endsWith(".png")) contentType = "image/png";

            byte[] bytes = Files.readAllBytes(file.toPath());
            exchange.getResponseHeaders().set("Content-Type", contentType);
            exchange.getResponseHeaders().set("Cache-Control", "no-cache, no-store, must-revalidate");
            exchange.sendResponseHeaders(200, bytes.length);
            try (OutputStream os = exchange.getResponseBody()) {
                os.write(bytes);
            }
        }
    }

    // --- CONFIG HANDLER (GET / POST) ---
    private static class ConfigHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            String method = exchange.getRequestMethod();
            if ("GET".equalsIgnoreCase(method)) {
                handleGet(exchange);
            } else if ("POST".equalsIgnoreCase(method)) {
                handlePost(exchange);
            } else {
                sendErrorResponse(exchange, 405, "Method Not Allowed");
            }
        }

        private void handleGet(HttpExchange exchange) throws IOException {
            // Get registry and format to JSON manually
            StringBuilder sb = new StringBuilder();
            sb.append("[");
            
            // Access is synchronized by lock or thread safe copies
            Logger root = LoggerManager.getLogger("root");
            // To retrieve all, we can query standard list
            // For simplicty, return root configurations and app configs
            List<Logger> allLoggers = List.of(
                LoggerManager.getLogger("root"),
                LoggerManager.getLogger("app"),
                LoggerManager.getLogger("app.service"),
                LoggerManager.getLogger("app.db")
            );

            boolean firstLogger = true;
            for (Logger logger : allLoggers) {
                if (!firstLogger) sb.append(",");
                firstLogger = false;

                sb.append("{");
                sb.append("\"name\":\"").append(logger.getName()).append("\",");
                sb.append("\"propagate\":").append(logger.isPropagate()).append(",");
                sb.append("\"parent\":").append(logger.getParent() == null ? "null" : "\"" + logger.getParent().getName() + "\"").append(",");
                sb.append("\"destinations\":[");

                boolean firstDest = true;
                for (Destination d : logger.getDestinations()) {
                    if (!firstDest) sb.append(",");
                    firstDest = false;

                    sb.append("{");
                    sb.append("\"id\":\"").append(d.getId()).append("\",");
                    sb.append("\"min_level\":\"").append(d.getMinLevel().name()).append("\",");
                    sb.append("\"formatter\":\"").append(d.getFormatter() instanceof JsonFormatter ? "json" : "plain").append("\",");
                    sb.append("\"sink\":\"").append(d.getSink().getClass().getSimpleName()).append("\",");
                    sb.append("\"async\":").append(d.isAsyncMode()).append(",");
                    sb.append("\"queue_capacity\":").append(d.getQueueCapacity()).append(",");
                    sb.append("\"backpressure_policy\":\"").append(d.getBackpressurePolicy().name()).append("\",");
                    sb.append("\"queue_size\":").append(d.getQueueSize());
                    sb.append("}");
                }
                sb.append("]");
                sb.append("}");
            }
            sb.append("]");

            sendJsonResponse(exchange, 200, sb.toString());
        }

        private void handlePost(HttpExchange exchange) throws IOException {
            String body = readRequestBody(exchange);
            try {
                Object parsed = SimpleJsonParser.parse(body);
                if (!(parsed instanceof List)) {
                    sendErrorResponse(exchange, 400, "Invalid configuration array");
                    return;
                }

                // Truncate logs & Reset managers
                LoggerManager.reset();
                Set<String> filesToTruncate = new HashSet<>();

                List<?> loggersList = (List<?>) parsed;
                for (Object item : loggersList) {
                    if (item instanceof Map) {
                        Map<?, ?> map = (Map<?, ?>) item;
                        String name = (String) map.get("name");
                        boolean propagate = map.containsKey("propagate") ? (Boolean) map.get("propagate") : true;

                        Logger logger = LoggerManager.getLogger(name);
                        logger.setPropagate(propagate);

                        List<?> destList = (List<?>) map.get("destinations");
                        if (destList != null) {
                            for (Object destObj : destList) {
                                if (destObj instanceof Map) {
                                    Map<?, ?> dMap = (Map<?, ?>) destObj;
                                    LogLevel level = LogLevel.fromStr((String) dMap.get("min_level"));
                                    String fmtType = (String) dMap.get("formatter");
                                    String pattern = (String) dMap.get("pattern");
                                    String sinkType = (String) dMap.get("sink");
                                    String filePath = (String) dMap.get("file_path");
                                    boolean async = dMap.containsKey("async") ? (Boolean) dMap.get("async") : false;
                                    int capacity = dMap.containsKey("queue_capacity") ? ((Number) dMap.get("queue_capacity")).intValue() : 100;
                                    String policyStr = (String) dMap.get("backpressure_policy");
                                    QueueBackpressurePolicy policy = QueueBackpressurePolicy.valueOf(policyStr == null ? "BLOCK" : policyStr);

                                    // Build formatter
                                    logger.Formatter formatter = "json".equalsIgnoreCase(fmtType) 
                                        ? new JsonFormatter() 
                                        : new PlainTextFormatter(pattern);

                                    // Build sink
                                    Sink sink;
                                    if ("file".equalsIgnoreCase(sinkType)) {
                                        if (filePath == null || filePath.isEmpty()) {
                                            filePath = "app.log";
                                        }
                                        filesToTruncate.add(filePath);
                                        sink = new FileSink(filePath);
                                    } else if ("memory".equalsIgnoreCase(sinkType)) {
                                        sink = new MemorySink();
                                    } else {
                                        sink = new ConsoleSink(System.out);
                                    }

                                    Destination dest = new Destination(
                                        formatter,
                                        level,
                                        sink,
                                        async,
                                        capacity,
                                        policy
                                    );
                                    logger.addDestination(dest);
                                }
                            }
                        }
                    }
                }

                // Truncate logs
                for (String path : filesToTruncate) {
                    try (PrintWriter pw = new PrintWriter(path)) {
                        pw.print("");
                    } catch (Exception e) {
                        // ignore
                    }
                }

                LoggerManager.invalidateAllCaches();
                sendJsonResponse(exchange, 200, "{\"status\":\"ok\",\"message\":\"Configuration updated successfully\"}");
            } catch (Exception e) {
                sendErrorResponse(exchange, 500, "Error parsing configuration: " + e.getMessage());
            }
        }
    }

    // --- SIMULATE HANDLER ---
    private static class SimulateHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (!"POST".equalsIgnoreCase(exchange.getRequestMethod())) {
                sendErrorResponse(exchange, 405, "Method Not Allowed");
                return;
            }

            String body = readRequestBody(exchange);
            try {
                Map<String, Object> map = (Map<String, Object>) SimpleJsonParser.parse(body);
                int threads = ((Number) map.get("threads")).intValue();
                int logsPerThread = ((Number) map.get("logs_per_thread")).intValue();
                double interval = ((Number) map.get("interval")).doubleValue();
                String loggerName = (String) map.get("logger_name");
                List<?> lvlsStr = (List<?>) map.get("levels");

                List<LogLevel> levels = new ArrayList<>();
                for (Object o : lvlsStr) {
                    levels.add(LogLevel.fromStr((String) o));
                }

                SimulationRunner.startSimulation(threads, logsPerThread, interval, loggerName, levels);
                sendJsonResponse(exchange, 200, "{\"status\":\"started\",\"threads\":" + threads + "}");
            } catch (Exception e) {
                sendErrorResponse(exchange, 500, "Failed to start simulation: " + e.getMessage());
            }
        }
    }

    // --- STOP SIMULATE HANDLER ---
    private static class StopSimulateHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (!"POST".equalsIgnoreCase(exchange.getRequestMethod())) {
                sendErrorResponse(exchange, 405, "Method Not Allowed");
                return;
            }
            SimulationRunner.stopAllSimulations();
            sendJsonResponse(exchange, 200, "{\"status\":\"stopped\"}");
        }
    }

    // --- SSE EVENTS HANDLER ---
    private static class SseHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            exchange.getResponseHeaders().set("Content-Type", "text/event-stream");
            exchange.getResponseHeaders().set("Cache-Control", "no-cache");
            exchange.getResponseHeaders().set("Connection", "keep-alive");
            exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
            
            // Length = 0 activates chunked transfer encoding in sun HttpServer
            exchange.sendResponseHeaders(200, 0);

            OutputStream os = exchange.getResponseBody();
            BlockingQueue<String> q = EventBus.register();

            try {
                // Send connected event
                String connEvent = "data: {\"type\":\"connected\",\"data\":{\"status\":\"live\"}}\n\n";
                os.write(connEvent.getBytes(StandardCharsets.UTF_8));
                os.flush();

                while (true) {
                    try {
                        String payload = q.poll(500, TimeUnit.MILLISECONDS);
                        if (payload != null) {
                            String ssePayload = "data: " + payload + "\n\n";
                            os.write(ssePayload.getBytes(StandardCharsets.UTF_8));
                            os.flush();
                        } else {
                            // Keep alive ping
                            os.write(": ping\n\n".getBytes(StandardCharsets.UTF_8));
                            os.flush();
                        }
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                        break;
                    }
                }
            } catch (IOException e) {
                // Client disconnected
            } finally {
                EventBus.unregister(q);
                exchange.close();
            }
        }
    }

    // --- UTILITIES ---
    private static String readRequestBody(HttpExchange exchange) throws IOException {
        try (InputStream is = exchange.getRequestBody();
             BufferedReader reader = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8))) {
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line);
            }
            return sb.toString();
        }
    }

    private static void sendJsonResponse(HttpExchange exchange, int code, String json) throws IOException {
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.getResponseHeaders().set("Cache-Control", "no-cache, no-store, must-revalidate");
        exchange.sendResponseHeaders(code, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }

    private static void sendErrorResponse(HttpExchange exchange, int code, String msg) throws IOException {
        String json = "{\"status\":\"error\",\"error\":\"" + msg.replace("\"", "\\\"") + "\"}";
        sendJsonResponse(exchange, code, json);
    }

    // --- PURE STANDARD RECURSIVE DESCENT JSON PARSER ---
    public static class SimpleJsonParser {
        public static Object parse(String json) {
            if (json == null) return null;
            return new Parser(json.trim()).parse();
        }

        private static class Parser {
            private final String src;
            private int pos = 0;

            public Parser(String src) {
                this.src = src;
            }

            private char peek() {
                return pos < src.length() ? src.charAt(pos) : '\0';
            }

            private char next() {
                return pos < src.length() ? src.charAt(pos++) : '\0';
            }

            private void skipWhitespace() {
                while (pos < src.length() && Character.isWhitespace(src.charAt(pos))) {
                    pos++;
                }
            }

            public Object parse() {
                skipWhitespace();
                char c = peek();
                if (c == '{') return parseObject();
                if (c == '[') return parseArray();
                if (c == '"') return parseString();
                if (Character.isDigit(c) || c == '-') return parseNumber();
                if (c == 't' || c == 'f') return parseBoolean();
                if (c == 'n') {
                    pos += 4; // skip 'null'
                    return null;
                }
                return null;
            }

            private Map<String, Object> parseObject() {
                Map<String, Object> map = new HashMap<>();
                next(); // skip '{'
                while (pos < src.length()) {
                    skipWhitespace();
                    if (peek() == '}') {
                        next();
                        break;
                    }
                    String key = parseString();
                    skipWhitespace();
                    next(); // skip ':'
                    Object val = parse();
                    map.put(key, val);
                    skipWhitespace();
                    char c = peek();
                    if (c == ',') {
                        next();
                    } else if (c == '}') {
                        next();
                        break;
                    }
                }
                return map;
            }

            private List<Object> parseArray() {
                List<Object> list = new ArrayList<>();
                next(); // skip '['
                while (pos < src.length()) {
                    skipWhitespace();
                    if (peek() == ']') {
                        next();
                        break;
                    }
                    list.add(parse());
                    skipWhitespace();
                    char c = peek();
                    if (c == ',') {
                        next();
                    } else if (c == ']') {
                        next();
                        break;
                    }
                }
                return list;
            }

            private String parseString() {
                next(); // skip opening '"'
                StringBuilder sb = new StringBuilder();
                while (pos < src.length()) {
                    char c = next();
                    if (c == '"') {
                        break;
                    }
                    if (c == '\\') {
                        char escape = next();
                        if (escape == 'n') sb.append('\n');
                        else if (escape == 'r') sb.append('\r');
                        else if (escape == 't') sb.append('\t');
                        else sb.append(escape);
                    } else {
                        sb.append(c);
                    }
                }
                return sb.toString();
            }

            private Number parseNumber() {
                int start = pos;
                if (peek() == '-') {
                    next();
                }
                while (Character.isDigit(peek()) || peek() == '.') {
                    next();
                }
                String s = src.substring(start, pos);
                if (s.contains(".")) {
                    return Double.parseDouble(s);
                }
                return Long.parseLong(s);
            }

            private Boolean parseBoolean() {
                if (peek() == 't') {
                    pos += 4; // 'true'
                    return true;
                } else {
                    pos += 5; // 'false'
                    return false;
                }
            }
        }
    }
}
