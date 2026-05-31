package logger;

import java.util.concurrent.ConcurrentHashMap;

public class LoggerManager {
    private static final ConcurrentHashMap<String, Logger> loggers = new ConcurrentHashMap<>();
    
    static {
        // Instantiate default root logger
        loggers.put("root", new Logger("root", null));
    }

    public static Logger getLogger(String name) {
        if (name == null || name.trim().isEmpty() || "root".equalsIgnoreCase(name.trim())) {
            return loggers.get("root");
        }
        
        String cleanName = name.trim();
        
        // Concurrent double check or computeIfAbsent
        return loggers.computeIfAbsent(cleanName, key -> {
            // Split dotted hierarchy, e.g. "app.service.db"
            String[] parts = key.split("\\.");
            
            // Resolve parent logger
            Logger parent;
            if (parts.length == 1) {
                // Direct child of root
                parent = loggers.get("root");
            } else {
                // Parent logger name is everything up to the last dot
                StringBuilder parentNameSb = new StringBuilder();
                for (int i = 0; i < parts.length - 1; i++) {
                    if (i > 0) {
                        parentNameSb.append(".");
                    }
                    parentNameSb.append(parts[i]);
                }
                // Recursively fetch/create the parent chain
                parent = getLogger(parentNameSb.toString());
            }

            return new Logger(key, parent);
        });
    }

    public static void invalidateAllCaches() {
        for (Logger logger : loggers.values()) {
            logger.invalidateCache();
        }
    }

    public static void reset() {
        // Shutdown all workers in destinations to avoid thread leaks
        for (Logger logger : loggers.values()) {
            for (Destination dest : logger.getDestinations()) {
                try {
                    dest.close();
                } catch (Exception e) {
                    System.err.println("Error closing destination on reset: " + e.getMessage());
                }
            }
            logger.getDestinations().clear();
            logger.invalidateCache();
        }
        
        loggers.clear();
        loggers.put("root", new Logger("root", null));
    }
}
