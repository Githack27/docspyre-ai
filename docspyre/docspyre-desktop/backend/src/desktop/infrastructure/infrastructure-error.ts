/** Only deliberate, credential-free messages from this class may cross desktop IPC. */
export class DesktopInfrastructureError extends Error {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = "DesktopInfrastructureError";
    }
}
