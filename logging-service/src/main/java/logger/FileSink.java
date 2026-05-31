package logger;

import java.io.BufferedWriter;
import java.io.FileWriter;
import java.io.IOException;
import java.util.Map;
import java.util.concurrent.locks.ReentrantLock;

public class FileSink implements Sink {
    private final String filePath;
    private final BufferedWriter writer;
    private final ReentrantLock lock = new ReentrantLock();

    public FileSink(String filePath) throws IOException {
        this.filePath = filePath;
        // Append mode = true
        this.writer = new BufferedWriter(new FileWriter(filePath, true));
    }

    @Override
    public void write(String formatted) {
        lock.lock();
        try {
            writer.write(formatted);
            writer.newLine();
            writer.flush();
        } catch (IOException e) {
            throw new RuntimeException("Failed to write to file: " + filePath, e);
        } finally {
            lock.unlock();
        }
        
        EventBus.emit("sink_write", Map.of(
            "sink", "FileSink",
            "target", "file",
            "path", filePath,
            "text", formatted
        ));
    }

    @Override
    public void close() throws Exception {
        lock.lock();
        try {
            writer.close();
        } finally {
            lock.unlock();
        }
    }
}
